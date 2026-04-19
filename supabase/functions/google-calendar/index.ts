import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Resposta de erro sempre como 200 + { error } para que o cliente leia a mensagem real
const errResponse = (msg: string) =>
  new Response(JSON.stringify({ error: msg }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── Renovação de access token ──────────────────────────────────────────────────

async function resolveAccessToken(
  supabase: any,
  profileId: string,
): Promise<string> {
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token, google_token_expires_at')
    .eq('id', profileId)
    .single()

  if (error || !prof) throw new Error('Perfil não encontrado')
  if (!prof.google_refresh_token) throw new Error('Google Calendar não conectado. Faça login com Google.')

  // google_token_expires_at é bigint (Unix ms)
  const expiresAt = prof.google_token_expires_at ? new Date(Number(prof.google_token_expires_at)) : new Date(0)
  if (expiresAt > new Date() && prof.google_access_token) return prof.google_access_token

  // Token expirado — renovar via refresh_token
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

  // Salvar como bigint (Unix ms)
  await supabase.from('profiles').update({
    google_access_token: tokenData.access_token,
    google_token_expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  }).eq('id', profileId)

  return tokenData.access_token
}

// ── Listagem de eventos do Google Calendar ────────────────────────────────────

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

    // 1. Autenticar chamador via JWT (manual — verify_jwt desabilitado na infra)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errResponse('Não autorizado')

    const token = authHeader.replace('Bearer ', '')
    if (!token || token === 'undefined' || token === 'null') return errResponse('Token inválido')

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return errResponse('Usuário não autenticado: ' + (authError?.message ?? 'sem usuário'))

    // 2. Parsear body
    const { action, payload } = await req.json()

    // ── AÇÃO 1: Listar próximos eventos do aluno ───────────────────────────────
    if (action === 'list_student_events') {
      const { student_email, teacher_id } = payload

      const calendarOwner = teacher_id ?? user.id
      const accessToken = await resolveAccessToken(supabase, calendarOwner)

      const normalizedStudentEmail = student_email?.toLowerCase().trim()

      const now = new Date().toISOString()
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}` +
        `&singleEvents=true&orderBy=startTime&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const calData = await calRes.json()
      const allItems = calData.items || []

      // Debug: retorna attendees de todos os eventos para diagnóstico
      const debug_attendees = allItems.map((e: any) => ({
        title: e.summary,
        start: e.start?.dateTime,
        attendees: (e.attendees || []).map((a: any) => a.email),
      }))

      // Filtro case-insensitive para cobrir eventuais normalizações do Google
      const events = allItems
        .filter((e: any) =>
          e.attendees?.some((a: any) =>
            a.email?.toLowerCase().trim() === normalizedStudentEmail
          )
        )
        .map((e: any) => ({
          id: e.id,
          title: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          meet_link: e.hangoutLink || null,
          description: e.description || null,
        }))

      return new Response(JSON.stringify({ events, debug_attendees, student_email_used: student_email }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── AÇÃO 2: Listar próximos eventos do professor ───────────────────────────
    if (action === 'list_teacher_events') {
      const accessToken = await resolveAccessToken(supabase, user.id)

      // Retorna apenas eventos com attendees (eventos de aula criados pelo sistema)
      const events = await fetchCalendarEvents(
        accessToken,
        (e) => (e.attendees?.length ?? 0) > 0,
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

      // Resolver e-mail do aluno
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
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
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
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── AÇÃO 4: Atualizar evento de aula ─────────────────────────────────────
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
