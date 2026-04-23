import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  try {
    const threshold = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('class_sessions')
      .update({ status: 'missed_pending' })
      .eq('status', 'scheduled')
      .lt('scheduled_at', threshold)
      .select('id, student_id')

    if (error) throw error

    const updated = data ?? []

    // Send push notification to each affected student
    if (updated.length > 0) {
      const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
      const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')

      if (vapidPublic && vapidPrivate) {
        webpush.setVapidDetails('mailto:noreply@stepsacademy.com.br', vapidPublic, vapidPrivate)

        // Deduplicate student_ids (a student could have multiple sessions)
        const studentIds = [...new Set(updated.map((s: any) => s.student_id).filter(Boolean))]

        for (const studentId of studentIds) {
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('student_id', studentId)

          if (!subs || subs.length === 0) continue

          const payload = JSON.stringify({
            title: 'Aula com falta pendente ⚠️',
            body: 'Você perdeu uma aula. Acesse o app para remarcar.',
            icon: '/brand/pwa-icon.webp',
            badge: '/notification-icon.png',
            url: '/',
          })

          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
                { TTL: 3600, topic: 'missed-sessions' }
              )
              await supabase.from('notification_log').insert({
                student_id: studentId,
                type: 'push',
                title: 'Aula com falta pendente ⚠️',
                body: 'Você perdeu uma aula. Acesse o app para remarcar.',
                delivered: true,
              })
            } catch (e: any) {
              console.error('[check-missed] push error:', e?.statusCode, e?.body ?? e?.message)
              if (e?.statusCode === 410) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
              }
            }
          }
        }
      } else {
        console.warn('[check-missed] VAPID keys not set — skipping push notifications')
      }
    }

    return new Response(JSON.stringify({ updated: updated.length, threshold }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
