import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const errResponse = (msg: string) =>
  new Response(JSON.stringify({ error: msg }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── Renovação de access token ──────────────────────────────────────────────────

async function resolveAccessToken(supabase: any, profileId: string): Promise<string> {
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token, google_token_expires_at')
    .eq('id', profileId)
    .single()

  if (error || !prof) throw new Error('Perfil não encontrado')
  if (!prof.google_refresh_token) throw new Error('Google Calendar não conectado. Faça login com Google.')

  const expiresAt = prof.google_token_expires_at ? new Date(Number(prof.google_token_expires_at)) : new Date(0)
  if (expiresAt > new Date() && prof.google_access_token) return prof.google_access_token

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: prof.google_refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error('Falha ao renovar token do Google')

  await supabase.from('profiles').update({
    google_access_token: tokenData.access_token,
    google_token_expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  }).eq('id', profileId)

  return tokenData.access_token
}

// ── Listagem genérica de eventos do Google Calendar ───────────────────────────

async function fetchCalendarEvents(
  accessToken: string,
  filterFn: (e: any) => boolean,
  mapFn: (e: any) => any,
): Promise<any[]> {
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  return (data.items || []).filter(filterFn).map(mapFn)
}

// ── Handler principal ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errResponse('Não autorizado')

    const token = authHeader.replace('Bearer ', '')
    if (!token || token === 'undefined' || token === 'null') return errResponse('Token inválido')

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return errResponse('Usuário não autenticado: ' + (authError?.message ?? 'sem usuário'))

    const { action, payload } = await req.json()

    // ── AÇÃO 1: Listar próximas aulas do aluno ────────────────────────────────
    if (action === 'list_student_events') {
      const { student_email, student_db_id, student_profile_id, teacher_id } = payload

      const calendarOwner = teacher_id ?? user.id
      const accessToken = await resolveAccessToken(supabase, calendarOwner)
      const normalizedEmail = student_email?.toLowerCase().trim()

      // Busca emails alternativos do aluno para ampliar a detecção de attendees
      const { data: altEmailRows } = student_profile_id
        ? await supabase.from('profile_alternate_emails').select('email').eq('profile_id', student_profile_id)
        : { data: [] }

      const allStudentEmails = [
        normalizedEmail,
        ...(altEmailRows ?? []).map((e: any) => e.email?.toLowerCase().trim()),
      ].filter(Boolean)

      const now = new Date().toISOString()
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}` +
        `&singleEvents=true&orderBy=startTime&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const calData = await calRes.json()
      const allItems: any[] = calData.items || []

      // Filtro 1: padrão de nomenclatura Steps Academy ─ título deve conter ' | '
      const stepsItems = allItems.filter((e: any) => (e.summary ?? '').includes(' | '))

      // Filtro 2: vincular ao aluno (por attendee ou por grupo)
      const events: any[] = []

      for (const e of stepsItems) {
        const attendees: any[] = e.attendees || []
        const hasStudent = attendees.some(
          (a: any) => allStudentEmails.includes(a.email?.toLowerCase().trim())
        )

        let classType: 'individual' | 'duo' | 'group' = 'individual'
        let matched = false

        if (hasStudent) {
          matched = true
          // professor conta como 1 attendee; alunos = attendees.length - 1
          classType = attendees.length <= 2 ? 'individual' : 'duo'
        } else if (student_db_id) {
          // Caso turma: extrair identificador após ' | ' e buscar no banco
          const identifier = e.summary.split(' | ')[1]?.trim()
          if (identifier) {
            const { data: groupMatch } = await supabase
              .from('groups')
              .select('id, group_students!inner(student_id)')
              .ilike('name', `%${identifier}%`)
              .eq('group_students.student_id', student_db_id)
              .maybeSingle()

            if (groupMatch) {
              matched = true
              classType = 'group'
            }
          }
        }

        if (!matched) continue

        events.push({
          id: e.id,
          title: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          meet_link: e.hangoutLink || null,
          description: e.description || null,
          class_type: classType,
          is_rescheduled: e.colorId === '5',
        })
      }

      return new Response(JSON.stringify({ events }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── AÇÃO 2: Listar próximos eventos do professor ───────────────────────────
    if (action === 'list_teacher_events') {
      const accessToken = await resolveAccessToken(supabase, user.id)

      const events = await fetchCalendarEvents(
        accessToken,
        (e) => (e.summary ?? '').includes(' | '),
        (e) => ({
          id: e.id,
          title: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          meet_link: e.hangoutLink || null,
          description: e.description || null,
          attendees: (e.attendees || []).map((a: any) => ({
            email: a.email,
            name: a.displayName || null,
          })),
        }),
      )

      return new Response(JSON.stringify({ events }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── AÇÃO 3: Criar novo evento de aula ─────────────────────────────────────
    if (action === 'create_class_event') {
      const { student_user_id, student_name, start_datetime, end_datetime, language } = payload

      const accessToken = await resolveAccessToken(supabase, user.id)

      let student_email: string | undefined = payload.student_email
      if (!student_email && student_user_id) {
        const { data: { user: studentUser }, error: userErr } =
          await supabase.auth.admin.getUserById(student_user_id)
        if (userErr || !studentUser?.email) throw new Error('Não foi possível obter o e-mail do aluno')
        student_email = studentUser.email
      }
      if (!student_email) throw new Error('E-mail do aluno não fornecido')

      const event = {
        summary: `Aula de ${language} — ${student_name}`,
        description: `Aula ao vivo steps academy\nAluno: ${student_name}`,
        start: { dateTime: start_datetime, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: end_datetime, timeZone: 'America/Sao_Paulo' },
        attendees: [{ email: student_email }],
        conferenceData: {
          createRequest: {
            requestId: `steps-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
      }

      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        }
      )
      const created = await res.json()

      if (!created.id) {
        throw new Error(`Google Calendar recusou o evento: ${created.error?.message ?? JSON.stringify(created)}`)
      }

      return new Response(JSON.stringify({
        event_id: created.id,
        meet_link: created.hangoutLink,
        start: created.start?.dateTime,
        end: created.end?.dateTime,
        html_link: created.htmlLink,
        student_email,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── AÇÃO 4: Atualizar evento de aula ──────────────────────────────────────
    if (action === 'update_event') {
      const { google_event_id, start_datetime, end_datetime, teacher_id } = payload
      const calendarOwner = teacher_id ?? user.id
      const accessToken = await resolveAccessToken(supabase, calendarOwner)

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: { dateTime: start_datetime, timeZone: 'America/Sao_Paulo' },
            end: { dateTime: end_datetime, timeZone: 'America/Sao_Paulo' },
          }),
        }
      )
      const updated = await res.json()
      if (!updated.id) throw new Error(`Google Calendar recusou a atualização: ${updated.error?.message ?? JSON.stringify(updated)}`)

      return new Response(JSON.stringify({
        event_id: updated.id,
        start: updated.start?.dateTime,
        end: updated.end?.dateTime,
        meet_link: updated.hangoutLink,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return errResponse(`Ação desconhecida: ${action}`)

  } catch (err: any) {
    return errResponse(err.message ?? 'Erro interno')
  }
})
