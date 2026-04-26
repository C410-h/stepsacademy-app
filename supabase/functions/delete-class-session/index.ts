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

    // Auth: teacher or admin only
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return err('Não autorizado', 401)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return err('Token inválido', 401)

    const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['teacher', 'admin'].includes(caller?.role)) return err('Apenas professores e admins podem excluir aulas', 403)

    const { session_id } = await req.json()
    if (!session_id) return err('session_id é obrigatório')

    // Fetch session
    const { data: session, error: sessErr } = await supabase
      .from('class_sessions')
      .select('id, google_event_id, teacher_id')
      .eq('id', session_id)
      .single()
    if (sessErr || !session) return err('Sessão não encontrada')

    // Delete from GCal if event exists
    let gcalDeleted = false
    if (session.google_event_id && session.teacher_id) {
      const accessToken = await resolveAccessToken(supabase, session.teacher_id)
      if (accessToken) {
        const gcalRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${session.google_event_id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
        )
        gcalDeleted = gcalRes.status === 204 || gcalRes.status === 200
        if (!gcalDeleted && gcalRes.status !== 404) {
          const body = await gcalRes.text()
          console.warn('[delete-class-session] GCal delete failed', gcalRes.status, body)
        }
      }
    }

    // Delete attendees then session
    await supabase.from('session_attendees').delete().eq('session_id', session_id)
    const { error: delErr } = await supabase.from('class_sessions').delete().eq('id', session_id)
    if (delErr) return err(`Erro ao excluir sessão: ${delErr.message}`, 500)

    console.log('[delete-class-session] done', { session_id, gcalDeleted })
    return ok({ success: true, gcal_deleted: gcalDeleted })

  } catch (e: any) {
    console.error('[delete-class-session] unexpected error:', e.message)
    return err(e.message ?? 'Erro interno', 500)
  }
})

async function resolveAccessToken(supabase: any, profileId: string): Promise<string | null> {
  const { data: prof } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token, google_token_expires_at')
    .eq('id', profileId)
    .single()

  if (!prof?.google_refresh_token) return null

  const expiresAt = prof.google_token_expires_at
    ? new Date(Number(prof.google_token_expires_at))
    : new Date(0)

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
  if (!tokenData.access_token) return null

  await supabase.from('profiles').update({
    google_access_token: tokenData.access_token,
    google_token_expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  }).eq('id', profileId)

  return tokenData.access_token
}
