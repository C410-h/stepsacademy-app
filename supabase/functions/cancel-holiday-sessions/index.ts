import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

async function resolveAccessToken(profileId: string): Promise<string | null> {
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

async function cancelSessionsForDate(
  holidayDate: string,
  holiday: { id: string; name: string; message: string | null; cancelled_at: string | null },
  force: boolean
): Promise<{ cancelled: number; studentIds: Set<string> }> {
  if (holiday.cancelled_at && !force) {
    return { cancelled: 0, studentIds: new Set() }
  }

  const dayStart = new Date(holidayDate + 'T00:00:00-03:00').toISOString()
  const dayEnd   = new Date(holidayDate + 'T23:59:59-03:00').toISOString()

  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, student_id, google_event_id, teacher_id')
    .eq('status', 'scheduled')
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)

  const studentIds = new Set<string>()

  if (!sessions?.length) {
    await supabase.from('national_holidays').update({
      sessions_cancelled: 0,
      cancelled_at: new Date().toISOString(),
    }).eq('id', holiday.id)
    return { cancelled: 0, studentIds }
  }

  const byTeacher = new Map<string, typeof sessions>()
  for (const s of sessions) {
    const list = byTeacher.get(s.teacher_id) ?? []
    list.push(s)
    byTeacher.set(s.teacher_id, list)
  }

  for (const [teacherId, teacherSessions] of byTeacher) {
    const token = await resolveAccessToken(teacherId)
    if (!token) {
      console.warn(`[cancel-holiday] no token for teacher ${teacherId}, skipping GCal`)
      continue
    }
    for (const s of teacherSessions) {
      if (s.google_event_id) {
        const gcalRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(s.google_event_id)}?sendUpdates=all`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        )
        if (gcalRes.status !== 204 && gcalRes.status !== 200 && gcalRes.status !== 404) {
          console.warn(`[cancel-holiday] GCal DELETE ${s.google_event_id} → ${gcalRes.status}`)
        }
      }
      if (s.student_id) studentIds.add(s.student_id)
    }
  }

  const { count } = await supabase
    .from('class_sessions')
    .delete({ count: 'exact' })
    .eq('status', 'scheduled')
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)

  await supabase.from('national_holidays').update({
    sessions_cancelled: count ?? sessions.length,
    cancelled_at: new Date().toISOString(),
  }).eq('id', holiday.id)

  console.log(`[cancel-holiday] ${holidayDate} — ${holiday.name}: ${count} sessões canceladas`)
  return { cancelled: count ?? sessions.length, studentIds }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const overrideDate = body.date as string | undefined
    const force        = body.force === true

    // Today in Brazil (UTC-3, no DST since 2019)
    const now     = new Date()
    const todayBR = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().substring(0, 10)

    if (overrideDate) {
      // ── Admin manual trigger: cancel sessions for specific date, NO notification ──
      const { data: holiday } = await supabase
        .from('national_holidays')
        .select('id, name, message, cancelled_at')
        .eq('date', overrideDate)
        .maybeSingle()

      if (!holiday) {
        return new Response(JSON.stringify({ ok: false, error: 'Date is not a holiday' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        })
      }

      const { cancelled, studentIds } = await cancelSessionsForDate(overrideDate, holiday, force)
      return new Response(
        JSON.stringify({ ok: true, cancelled, notified: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── Cron mode: cancel holidays in next 7 days + notify on the actual day ──
    const lookahead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const lookaheadBR = new Date(lookahead.getTime() - 3 * 60 * 60 * 1000).toISOString().substring(0, 10)

    const { data: upcomingHolidays } = await supabase
      .from('national_holidays')
      .select('id, name, message, date, cancelled_at')
      .gte('date', todayBR)
      .lte('date', lookaheadBR)
      .order('date', { ascending: true })

    if (!upcomingHolidays?.length) {
      console.log(`[cancel-holiday] no holidays in next 7 days`)
      return new Response(JSON.stringify({ ok: true, cancelled: 0, notified: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let totalCancelled = 0
    let totalNotified  = 0

    for (const holiday of upcomingHolidays) {
      const { cancelled, studentIds } = await cancelSessionsForDate(holiday.date, holiday, false)
      totalCancelled += cancelled

      // Push notification ONLY on the actual holiday day
      if (holiday.date === todayBR && studentIds.size > 0) {
        const notifTitle = `Sem aula hoje — ${holiday.name}`
        const notifBody  = holiday.message ?? `As aulas estão suspensas hoje por conta do feriado de ${holiday.name}.`
        for (const studentId of studentIds) {
          await supabase.functions.invoke('send-push', {
            body: { student_id: studentId, title: notifTitle, body: notifBody, url: '/dashboard' },
          })
        }
        totalNotified += studentIds.size
        console.log(`[cancel-holiday] notificados ${studentIds.size} alunos para ${holiday.name}`)
      }
    }

    return new Response(
      JSON.stringify({ ok: true, cancelled: totalCancelled, notified: totalNotified }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('[cancel-holiday] error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
