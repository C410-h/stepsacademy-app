import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webPush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // Verify the caller is authenticated (any role — student can trigger this)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { title, body, url } = await req.json()
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title e body são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch all push subscriptions belonging to admin profiles
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, profile_id')
      .not('profile_id', 'is', null)
      .in(
        'profile_id',
        // Subselect: profile IDs where role = 'admin'
        (await supabase.from('profiles').select('id').eq('role', 'admin')).data?.map((p: any) => p.id) ?? []
      )

    if (!subs?.length) {
      console.log('[notify-admin-push] no admin subscriptions found')
      return new Response(JSON.stringify({ sent: 0, message: 'Nenhuma subscription de admin encontrada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    webPush.setVapidDetails(
      'mailto:noreply@stepsacademy.com.br',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    )

    const payload = JSON.stringify({
      title,
      body,
      icon: '/brand/pwa-icon.webp',
      badge: '/notification-icon.png',
      url: url ?? '/admin',
    })

    let sent = 0
    let failed = 0

    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400, topic: 'admin-activity' }
        )
        sent++
      } catch (err: any) {
        failed++
        console.error('[notify-admin-push] push error:', err.statusCode, err.body)
        // Remove expired subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }

    console.log(`[notify-admin-push] sent: ${sent}, failed: ${failed}`)
    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('[notify-admin-push] unexpected error:', err.message)
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
