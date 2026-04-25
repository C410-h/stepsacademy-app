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

Deno.serve(async () => {
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

    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

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
      const events = (calData.items ?? []).filter(
        (e: any) => (e.summary ?? '').includes(' | ')
      )

      for (const e of events) {
        const [langPart, identPart] = (e.summary ?? '').split(' | ')
        const identifier  = identPart?.trim()
        const languageId  = resolveLanguageId(langPart?.trim() ?? '')
        const scheduledAt = e.start?.dateTime || e.start?.date
        const endsAt      = e.end?.dateTime || e.end?.date
        const meetLink    = e.hangoutLink ?? null

        if (!scheduledAt || !endsAt || !identifier) continue

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

        let sessionData: Record<string, any>

        if (matched.length === 1) {
          // ── Individual ─────────────────────────────────────────────────────
          sessionData = {
            google_event_id: e.id,
            student_id:  matched[0].studentId,
            teacher_id:  teacher.id,
            scheduled_at: scheduledAt,
            ends_at:     endsAt,
            meet_link:   meetLink,
            language_id: languageId,
            status:      'scheduled',
          }
          await supabase.from('class_sessions').upsert(sessionData, {
            onConflict: 'google_event_id,student_id',
            ignoreDuplicates: true,
          })
          await supabase.from('class_sessions')
            .update({ scheduled_at: scheduledAt, ends_at: endsAt, meet_link: meetLink })
            .eq('google_event_id', e.id)
            .eq('student_id', matched[0].studentId)
            .eq('status', 'scheduled')

        } else if (matched.length === 2) {
          // ── Dupla ──────────────────────────────────────────────────────────
          const [a, b] = matched.sort((x, y) => x.name.localeCompare(y.name))
          const title  = `${a.name.split(' ')[0]} & ${b.name.split(' ')[0]}`
          sessionData  = {
            google_event_id: e.id,
            student_id:  null,
            teacher_id:  teacher.id,
            scheduled_at: scheduledAt,
            ends_at:     endsAt,
            meet_link:   meetLink,
            language_id: languageId,
            title,
            status:      'scheduled',
          }
          // Partial unique index covers google_event_id WHERE student_id IS NULL
          await supabase.from('class_sessions').upsert(sessionData, {
            onConflict: 'google_event_id',
            ignoreDuplicates: true,
          })
          await supabase.from('class_sessions')
            .update({ scheduled_at: scheduledAt, ends_at: endsAt, meet_link: meetLink })
            .eq('google_event_id', e.id)
            .is('student_id', null)
            .eq('status', 'scheduled')

        } else {
          // ── Grupo (0 ou 3+ matches) ────────────────────────────────────────
          // Grupo usa o identificador do título GCal como display name.
          sessionData  = {
            google_event_id: e.id,
            student_id:  null,
            teacher_id:  teacher.id,
            scheduled_at: scheduledAt,
            ends_at:     endsAt,
            meet_link:   meetLink,
            language_id: languageId,
            title:       identifier,
            status:      'scheduled',
          }
          await supabase.from('class_sessions').upsert(sessionData, {
            onConflict: 'google_event_id',
            ignoreDuplicates: true,
          })
          await supabase.from('class_sessions')
            .update({ scheduled_at: scheduledAt, ends_at: endsAt, meet_link: meetLink })
            .eq('google_event_id', e.id)
            .is('student_id', null)
            .eq('status', 'scheduled')
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
