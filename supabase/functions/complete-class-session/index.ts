import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ok = (data: unknown) =>
    new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const err = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // ── Auth: somente teacher ou admin ─────────────────────────────────────────
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return err('Não autorizado', 401)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return err('Token inválido', 401)

    const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['teacher', 'admin'].includes(caller?.role)) return err('Apenas professores e admins podem marcar aulas como concluídas', 403)

    // ── Payload ────────────────────────────────────────────────────────────────
    const { session_id } = await req.json()
    if (!session_id) return err('session_id é obrigatório')

    // ── 1. Busca a sessão alvo ─────────────────────────────────────────────────
    const { data: targetSession, error: sessErr } = await supabase
      .from('class_sessions')
      .select('id, student_id, google_event_id, teacher_id, scheduled_at')
      .eq('id', session_id)
      .single()
    if (sessErr || !targetSession) return err('Sessão não encontrada')

    // ── 2. Para turmas: busca todas as sessões do mesmo evento ─────────────────
    // Sessões do mesmo google_event_id = mesma aula ao vivo para múltiplos alunos
    let allSessions: { id: string; student_id: string }[] = []
    if (targetSession.google_event_id) {
      const { data: siblings } = await supabase
        .from('class_sessions')
        .select('id, student_id')
        .eq('google_event_id', targetSession.google_event_id)
        .eq('teacher_id', targetSession.teacher_id)
      allSessions = siblings ?? []
    }
    // Fallback: somente a sessão clicada
    if (!allSessions.length) {
      allSessions = [{ id: targetSession.id, student_id: targetSession.student_id }]
    }

    // ── 3. Marca todas as sessões como concluídas ──────────────────────────────
    const sessionIds = allSessions.map(s => s.id)
    await supabase
      .from('class_sessions')
      .update({ status: 'completed' })
      .in('id', sessionIds)

    // ── 4. Avança o progresso de cada aluno ───────────────────────────────────
    const studentIds = [...new Set(allSessions.map(s => s.student_id).filter(Boolean))]
    const progressResults: Record<string, string> = {}

    for (const studentId of studentIds) {
      try {
        // 4a. Pega o current_step_id do aluno
        const { data: student } = await supabase
          .from('students')
          .select('id, current_step_id, level_id')
          .eq('id', studentId)
          .single()

        if (!student?.current_step_id) {
          progressResults[studentId] = 'sem current_step_id — ignorado'
          continue
        }

        // 4b. Registra step_id nas sessões concluídas deste aluno
        const studentSessionIds = allSessions.filter(s => s.student_id === studentId).map(s => s.id)
        if (studentSessionIds.length > 0) {
          await supabase
            .from('class_sessions')
            .update({ step_id: student.current_step_id })
            .in('id', studentSessionIds)
        }

        // 4c. Marca o step atual como done em student_progress
        await supabase.from('student_progress').upsert(
          {
            student_id: studentId,
            step_id: student.current_step_id,
            status: 'done',
            is_inherited: false,
            done_at: new Date().toISOString(),
          },
          { onConflict: 'student_id,step_id' }
        )

        // 4d. Descobre o próximo step (mesmo unit, number + 1; ou próximo unit)
        const { data: currentStep } = await supabase
          .from('steps')
          .select('id, number, unit_id')
          .eq('id', student.current_step_id)
          .single()

        if (!currentStep) {
          progressResults[studentId] = 'step atual não encontrado'
          continue
        }

        // Tenta achar próximo step no mesmo unit
        let { data: nextStep } = await supabase
          .from('steps')
          .select('id, number, unit_id')
          .eq('unit_id', currentStep.unit_id)
          .eq('number', currentStep.number + 1)
          .maybeSingle()

        // Se não tem, procura o primeiro step do próximo unit (mesmo level)
        if (!nextStep) {
          const { data: currentUnit } = await supabase
            .from('units')
            .select('id, number, level_id')
            .eq('id', currentStep.unit_id)
            .single()

          if (currentUnit) {
            const { data: nextUnit } = await supabase
              .from('units')
              .select('id')
              .eq('level_id', currentUnit.level_id)
              .eq('number', currentUnit.number + 1)
              .maybeSingle()

            if (nextUnit) {
              const { data: firstStep } = await supabase
                .from('steps')
                .select('id, number, unit_id')
                .eq('unit_id', nextUnit.id)
                .order('number', { ascending: true })
                .limit(1)
                .maybeSingle()
              nextStep = firstStep ?? null
            }
          }
        }

        if (!nextStep) {
          // Aluno chegou ao fim do nível — apenas marca done, não avança
          progressResults[studentId] = 'fim do nível — step marcado como done'
          continue
        }

        // 4e. Cria o próximo step como available
        await supabase.from('student_progress').upsert(
          {
            student_id: studentId,
            step_id: nextStep.id,
            status: 'available',
            unlocked_at: new Date().toISOString(),
          },
          { onConflict: 'student_id,step_id' }
        )

        // 4f. Atualiza current_step_id do aluno
        await supabase
          .from('students')
          .update({ current_step_id: nextStep.id })
          .eq('id', studentId)

        // 4g. Pré-atribui step_id na próxima sessão agendada deste aluno
        const { data: nextSession } = await supabase
          .from('class_sessions')
          .select('id')
          .eq('student_id', studentId)
          .eq('status', 'scheduled')
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (nextSession) {
          await supabase
            .from('class_sessions')
            .update({ step_id: nextStep.id })
            .eq('id', nextSession.id)
        }

        progressResults[studentId] = `avançou para step ${nextStep.id}`
      } catch (e: any) {
        progressResults[studentId] = `erro: ${e.message}`
      }
    }

    console.log('[complete-class-session] done', { sessionIds, progressResults })
    return ok({ success: true, sessions_completed: sessionIds.length, progress: progressResults })

  } catch (e: any) {
    console.error('[complete-class-session] unexpected error:', e.message)
    return err(e.message ?? 'Erro interno', 500)
  }
})
