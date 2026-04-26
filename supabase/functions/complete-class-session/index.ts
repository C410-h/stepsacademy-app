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
    const body = await req.json()
    const { session_id } = body
    const absentIds: string[] = body.absent_student_ids ?? []
    if (!session_id) return err('session_id é obrigatório')

    // ── 1. Busca a sessão alvo ─────────────────────────────────────────────────
    const { data: targetSession, error: sessErr } = await supabase
      .from('class_sessions')
      .select('id, student_id, google_event_id, teacher_id, scheduled_at, group_id, is_trial')
      .eq('id', session_id)
      .single()
    if (sessErr || !targetSession) return err('Sessão não encontrada')

    // ── 2. Sessão individual vs. dupla/grupo ───────────────────────────────────
    if (targetSession.student_id !== null) {
      // ── SESSÃO INDIVIDUAL ────────────────────────────────────────────────────
      // Busca irmãs pelo mesmo google_event_id (compatibilidade legacy)
      let allSessions: { id: string; student_id: string }[] = []
      if (targetSession.google_event_id) {
        const { data: siblings } = await supabase
          .from('class_sessions')
          .select('id, student_id')
          .eq('google_event_id', targetSession.google_event_id)
          .eq('teacher_id', targetSession.teacher_id)
        allSessions = (siblings ?? []).filter(s => s.student_id !== null) as { id: string; student_id: string }[]
      }
      if (!allSessions.length) {
        allSessions = [{ id: targetSession.id, student_id: targetSession.student_id as string }]
      }

      // Marca todas como concluídas
      const sessionIds = allSessions.map(s => s.id)
      await supabase.from('class_sessions').update({ status: 'completed' }).in('id', sessionIds)

      // Avança progresso de cada aluno (não avança em aulas experimentais)
      const studentIds = [...new Set(allSessions.map(s => s.student_id).filter(Boolean))]
      const progressResults: Record<string, string> = {}
      if (targetSession.is_trial) {
        for (const studentId of studentIds) progressResults[studentId] = 'experimental — progresso não avançado'
      } else {
        for (const studentId of studentIds) {
          progressResults[studentId] = await advanceStudentProgress(supabase, studentId, session_id)
        }
      }

      console.log('[complete-class-session] individual done', { sessionIds, isTrial: targetSession.is_trial, progressResults })
      return ok({ success: true, sessions_completed: sessionIds.length, progress: progressResults })
    }

    // ── SESSÃO DE DUPLA / GRUPO (student_id IS NULL) ──────────────────────────

    // 2a. Descobre quem está nesta sessão
    let attendeeIds: string[] = []

    // Tenta session_attendees primeiro (populado na criação da sessão)
    const { data: existingAttendees } = await supabase
      .from('session_attendees')
      .select('student_id')
      .eq('session_id', session_id)
    if (existingAttendees?.length) {
      attendeeIds = existingAttendees.map((a: any) => a.student_id)
    } else if (targetSession.group_id) {
      // Fallback: carrega do grupo
      const { data: groupStudents } = await supabase
        .from('group_students')
        .select('student_id')
        .eq('group_id', targetSession.group_id)
      attendeeIds = (groupStudents ?? []).map((g: any) => g.student_id)
    }

    // 2b. Marca a sessão como concluída
    await supabase.from('class_sessions').update({ status: 'completed' }).eq('id', session_id)

    // 2c. Salva registros de presença/falta
    const presentIds = attendeeIds.filter(id => !absentIds.includes(id))
    const attendanceRecords = [
      ...presentIds.map(id => ({ session_id, student_id: id, status: 'present' })),
      ...absentIds.filter(id => attendeeIds.includes(id)).map(id => ({ session_id, student_id: id, status: 'absent' })),
    ]
    if (attendanceRecords.length) {
      await supabase
        .from('session_attendees')
        .upsert(attendanceRecords, { onConflict: 'session_id,student_id' })
    }

    // 2d. Avança progresso apenas de quem esteve presente
    const progressResults: Record<string, string> = {}
    for (const studentId of presentIds) {
      progressResults[studentId] = await advanceStudentProgress(supabase, studentId, session_id)
    }
    for (const studentId of absentIds.filter(id => attendeeIds.includes(id))) {
      progressResults[studentId] = 'ausente — progresso não avançado'
    }

    console.log('[complete-class-session] group done', {
      session_id,
      presentIds,
      absentIds,
      progressResults,
    })
    return ok({
      success: true,
      sessions_completed: 1,
      present: presentIds.length,
      absent: absentIds.length,
      progress: progressResults,
    })

  } catch (e: any) {
    console.error('[complete-class-session] unexpected error:', e.message)
    return err(e.message ?? 'Erro interno', 500)
  }
})

// ── Helper: avança um aluno para o próximo step ────────────────────────────────
async function advanceStudentProgress(supabase: any, studentId: string, sessionId: string): Promise<string> {
  try {
    const { data: student } = await supabase
      .from('students')
      .select('id, current_step_id, level_id')
      .eq('id', studentId)
      .single()

    if (!student?.current_step_id) return 'sem current_step_id — ignorado'

    // Registra step_id na sessão (apenas sessões deste aluno; ignora grupo)
    const { data: studentSessions } = await supabase
      .from('class_sessions')
      .select('id')
      .eq('student_id', studentId)
      .in('status', ['completed'])
      .order('scheduled_at', { ascending: false })
      .limit(1)
    if (studentSessions?.length) {
      await supabase
        .from('class_sessions')
        .update({ step_id: student.current_step_id })
        .eq('id', studentSessions[0].id)
    }

    // Também atualiza a sessão de grupo se for o caso
    await supabase
      .from('class_sessions')
      .update({ step_id: student.current_step_id })
      .eq('id', sessionId)
      .is('student_id', null)

    // Marca o step atual como done
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

    // Descobre o próximo step
    const { data: currentStep } = await supabase
      .from('steps')
      .select('id, number, unit_id')
      .eq('id', student.current_step_id)
      .single()
    if (!currentStep) return 'step atual não encontrado'

    let { data: nextStep } = await supabase
      .from('steps')
      .select('id, number, unit_id')
      .eq('unit_id', currentStep.unit_id)
      .eq('number', currentStep.number + 1)
      .maybeSingle()

    if (!nextStep) {
      const { data: currentUnit } = await supabase
        .from('units').select('id, number, level_id').eq('id', currentStep.unit_id).single()
      if (currentUnit) {
        const { data: nextUnit } = await supabase
          .from('units').select('id')
          .eq('level_id', currentUnit.level_id).eq('number', currentUnit.number + 1).maybeSingle()
        if (nextUnit) {
          const { data: firstStep } = await supabase
            .from('steps').select('id, number, unit_id')
            .eq('unit_id', nextUnit.id).order('number', { ascending: true }).limit(1).maybeSingle()
          nextStep = firstStep ?? null
        }
      }
    }

    if (!nextStep) return 'fim do nível — step marcado como done'

    // Cria próximo step como available
    await supabase.from('student_progress').upsert(
      { student_id: studentId, step_id: nextStep.id, status: 'available', unlocked_at: new Date().toISOString() },
      { onConflict: 'student_id,step_id' }
    )

    // Atualiza current_step_id
    await supabase.from('students').update({ current_step_id: nextStep.id }).eq('id', studentId)

    // Pré-atribui step na próxima sessão agendada deste aluno
    const { data: nextSession } = await supabase
      .from('class_sessions').select('id')
      .eq('student_id', studentId).eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true }).limit(1).maybeSingle()
    if (nextSession) {
      await supabase.from('class_sessions').update({ step_id: nextStep.id }).eq('id', nextSession.id)
    }

    return `avançou para step ${nextStep.id}`
  } catch (e: any) {
    return `erro: ${e.message}`
  }
}
