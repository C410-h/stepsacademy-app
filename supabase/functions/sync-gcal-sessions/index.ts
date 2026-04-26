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

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  const timeMin = body.timeMin ?? new Date().toISOString()
  const timeMax = body.timeMax ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: teachers } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'teacher')
      .not('google_refresh_token', 'is', null)

    const { data: languages } = await supabase.from('languages').select('id, name')
    const langMap = new Map(
      (languages ?? []).map((l: any) => [l.name.toLowerCase(), l.id])
    )

    function resolveLanguageId(raw: string): string | null {
      const normalized = raw.toLowerCase().trim()
      if (langMap.has(normalized)) return langMap.get(normalized)!
      for (const [k, v] of langMap) {
        if (k.includes(normalized) || normalized.includes(k)) return v
      }
      const aliases: Record<string, string> = {
        english: 'inglês', inglés: 'inglês', ingles: 'inglês',
        español: 'espanhol', spanish: 'espanhol',
      }
      const alias = aliases[normalized]
      return alias ? (langMap.get(alias) ?? null) : null
    }

    // Parse event title into lang/identifier/isRescheduled
    // Format A: "Inglês | Pedro"  → standard session
    // Format B: "Aula de inglês (Pedro)" → student-rescheduled session
    function parseTitle(summary: string): { langPart: string; identifier: string; isRescheduled: boolean } | null {
      if (summary.includes(' | ')) {
        const [langPart, identPart] = summary.split(' | ')
        const identifier = identPart?.trim()
        if (!identifier) return null
        return { langPart: langPart.trim(), identifier, isRescheduled: false }
      }
      // Format B1: "Aula de inglês (Pedro)" — parens
      const m1 = summary.match(/^aula de (.+?) \((.+)\)$/i)
      if (m1) return { langPart: m1[1].trim(), identifier: m1[2].trim(), isRescheduled: true }
      // Format B2: "Aula de Inglês - Pedro" — dash
      const m2 = summary.match(/^aula de (.+?) [-–] (.+)$/i)
      if (m2) return { langPart: m2[1].trim(), identifier: m2[2].trim(), isRescheduled: true }
      return null
    }

    // Load holiday dates to skip during sync
    const { data: holidayRows } = await supabase
      .from('national_holidays')
      .select('date')
      .gte('date', timeMin.substring(0, 10))
      .lte('date', timeMax.substring(0, 10))
    const holidayDates = new Set((holidayRows ?? []).map((h: any) => h.date))

    let synced = 0

    for (const teacher of teachers ?? []) {
      const accessToken = await resolveAccessToken(teacher.id)
      if (!accessToken) {
        console.warn(`[sync-gcal] no token for teacher ${teacher.id}`)
        continue
      }

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
        `&singleEvents=true&orderBy=startTime&maxResults=200`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const calData = await res.json()
      const events = (calData.items ?? []).filter((e: any) => {
        const s = e.summary ?? ''
        return s.includes(' | ') || /^aula de .+/i.test(s)
      })

      for (const e of events) {
        const parsed = parseTitle(e.summary ?? '')
        if (!parsed) continue
        const { langPart, identifier, isRescheduled } = parsed
        const languageId  = resolveLanguageId(langPart)
        const scheduledAt = e.start?.dateTime || e.start?.date
        const endsAt      = e.end?.dateTime || e.end?.date
        const meetLink    = e.hangoutLink ?? null

        if (!scheduledAt || !endsAt || !identifier) continue

        // Skip sessions on national holidays
        const sessionDate = scheduledAt.substring(0, 10)
        if (holidayDates.has(sessionDate)) continue

        // Match students by attendee email (primary + alternate)
        const matched: Array<{ studentId: string; name: string }> = []

        for (const attendee of (e.attendees ?? [])) {
          const email = attendee.email?.toLowerCase().trim()
          if (!email) continue

          const { data: profile } = await supabase
            .from('profiles')
            .select('id, name')
            .ilike('email', email)
            .eq('role', 'student')
            .maybeSingle()

          if (profile) {
            const { data: student } = await supabase
              .from('students')
              .select('id')
              .eq('user_id', profile.id)
              .maybeSingle()
            if (student) { matched.push({ studentId: student.id, name: profile.name }); continue }
          }

          const { data: alt } = await supabase
            .from('profile_alternate_emails')
            .select('profile_id, profiles(name)')
            .ilike('email', email)
            .maybeSingle()

          if (alt) {
            const { data: student } = await supabase
              .from('students')
              .select('id')
              .eq('user_id', alt.profile_id)
              .maybeSingle()
            if (student) {
              const name = (alt as any).profiles?.name ?? email
              matched.push({ studentId: student.id, name })
            }
          }
        }

        const isPast = new Date(scheduledAt) < new Date()

        if (matched.length === 1) {
          // ── Individual ─────────────────────────────────────────────────────
          const indivStatus = isRescheduled
            ? (isPast ? 'attended' : 'rescheduled')
            : (isPast ? 'attended' : 'scheduled')

          await supabase.from('class_sessions').upsert({
            google_event_id: e.id,
            student_id:   matched[0].studentId,
            teacher_id:   teacher.id,
            scheduled_at: scheduledAt,
            ends_at:      endsAt,
            meet_link:    meetLink,
            language_id:  languageId,
            reschedule_count: isRescheduled ? 1 : 0,
            ...(isRescheduled ? { rescheduled_at: scheduledAt, rescheduled_ends_at: endsAt } : {}),
            status: indivStatus,
          }, {
            onConflict: 'google_event_id,student_id',
            ignoreDuplicates: true,
          })
          if (!isPast) {
            const timeUpdate = isRescheduled
              ? { rescheduled_at: scheduledAt, rescheduled_ends_at: endsAt, meet_link: meetLink }
              : { scheduled_at: scheduledAt, ends_at: endsAt, meet_link: meetLink }
            await supabase.from('class_sessions')
              .update(timeUpdate)
              .eq('google_event_id', e.id)
              .eq('student_id', matched[0].studentId)
              .eq('status', indivStatus)
          }

        } else {
          // ── Dupla ou Grupo (student_id IS NULL) ────────────────────────────
          let title: string
          if (matched.length === 2) {
            const [a, b] = matched.sort((x, y) => x.name.localeCompare(y.name))
            title = `${a.name.split(' ')[0]} & ${b.name.split(' ')[0]}`
          } else {
            title = identifier
          }

          const { data: existing } = await supabase
            .from('class_sessions')
            .select('id')
            .eq('google_event_id', e.id)
            .is('student_id', null)
            .maybeSingle()

          let sessionId: string | null = existing?.id ?? null

          if (!existing) {
            const groupStatus = isRescheduled
              ? (isPast ? 'completed' : 'rescheduled')
              : (isPast ? 'completed' : 'scheduled')

            const { data: inserted } = await supabase.from('class_sessions').insert({
              google_event_id: e.id,
              student_id:  null,
              teacher_id:  teacher.id,
              scheduled_at: scheduledAt,
              ends_at:     endsAt,
              meet_link:   meetLink,
              language_id: languageId,
              reschedule_count: isRescheduled ? 1 : 0,
              ...(isRescheduled ? { rescheduled_at: scheduledAt, rescheduled_ends_at: endsAt } : {}),
              title,
              status: groupStatus,
            }).select('id').maybeSingle()
            sessionId = inserted?.id ?? null
          } else if (!isPast) {
            await supabase.from('class_sessions')
              .update({ scheduled_at: scheduledAt, ends_at: endsAt, meet_link: meetLink })
              .eq('id', existing.id)
              .eq('status', 'scheduled')
          }

          // Populate session_attendees for duo/group sessions
          if (sessionId && matched.length > 0) {
            await supabase.from('session_attendees').upsert(
              matched.map(m => ({ session_id: sessionId, student_id: m.studentId, status: 'pending' })),
              { onConflict: 'session_id,student_id', ignoreDuplicates: true }
            )
          }
        }

        synced++
      }
    }

    console.log(`[sync-gcal] done — ${synced} event(s) synced`)
    return new Response(JSON.stringify({ ok: true, synced }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[sync-gcal] error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
