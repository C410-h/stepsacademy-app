import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

  const expiresAt = new Date(prof.google_token_expires_at || 0)
  if (expiresAt > new Date()) return prof.google_access_token

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

  await supabase.from('profiles').update({
    google_access_token: tokenData.access_token,
    google_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  }).eq('id', profileId)

  return tokenData.access_token
}

// ── Handler principal ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Autenticar chamador via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado')

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('Usuário não autenticado')

    // 2. Parsear body antes de decidir qual token usar
    const { action, payload } = await req.json()

    // ── AÇÃO 1: Listar próximos eventos do aluno ───────────────────────────────
    if (action === 'list_student_events') {
      const { student_email, teacher_id } = payload

      // Quando teacher_id fornecido, usa tokens do professor (não do aluno chamador)
      // Isso permite que o aluno consulte o Calendar do seu professor
      const calendarOwner = teacher_id ?? user.id
      const accessToken = await resolveAccessToken(supabase, calendarOwner)

      const now = new Date().toISOString()
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}` +
        `&singleEvents=true&orderBy=startTime&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()

      // Filtra apenas eventos onde o e-mail do aluno é participante
      const events = (data.items || [])
        .filter((e: any) =>
          e.attendees?.some((a: any) => a.email === student_email)
        )
        .map((e: any) => ({
          id: e.id,
          title: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          meet_link: e.hangoutLink || null,
          description: e.description || null,
        }))

      return new Response(JSON.stringify({ events }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── AÇÃO 2: Criar novo evento de aula ─────────────────────────────────────
    if (action === 'create_class_event') {
      const { student_user_id, student_name, start_datetime, end_datetime, language } = payload

      // Usa tokens do chamador (professor logado)
      const accessToken = await resolveAccessToken(supabase, user.id)

      // Resolver e-mail do aluno via auth.admin (service role)
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

      return new Response(JSON.stringify({
        event_id: created.id,
        meet_link: created.hangoutLink,
        start: created.start?.dateTime,
        end: created.end?.dateTime,
        html_link: created.htmlLink,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Ação desconhecida: ${action}`)

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
