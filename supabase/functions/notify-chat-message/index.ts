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

    // Auth — caller must be authenticated; sender_id is taken from the verified user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: corsHeaders })
    }

    const { message_id } = await req.json()
    if (!message_id) {
      return new Response(JSON.stringify({ error: 'message_id required' }), { status: 400, headers: corsHeaders })
    }

    // Load the message + sender + room kind
    const { data: msg } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, content, file_name, profiles!chat_messages_sender_id_fkey(name)')
      .eq('id', message_id)
      .maybeSingle()

    if (!msg || msg.sender_id !== user.id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders })
    }

    const senderName = (msg as any).profiles?.name ?? 'Alguém'
    const preview = (msg.content ?? '').slice(0, 100) || (msg.file_name ? `📎 ${msg.file_name}` : 'Nova mensagem')

    // Recipients: all members of the room EXCEPT the sender, EXCEPT muted
    const { data: members } = await supabase
      .from('chat_members')
      .select('user_id, is_muted')
      .eq('room_id', msg.room_id)
      .neq('user_id', user.id)

    const recipientProfileIds = new Set<string>(
      (members ?? []).filter((m: any) => !m.is_muted).map((m: any) => m.user_id)
    )

    // Plus all admins (they observe every room) — but skip if sender is admin
    const { data: senderProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const senderIsAdmin = senderProfile?.role === 'admin'

    if (!senderIsAdmin) {
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      ;(admins ?? []).forEach((a: any) => {
        if (a.id !== user.id) recipientProfileIds.add(a.id)
      })
    }

    if (recipientProfileIds.size === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'no recipients' }), { headers: corsHeaders })
    }

    // Fetch push subscriptions for those profiles
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, profile_id')
      .in('profile_id', Array.from(recipientProfileIds))

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'no subs' }), { headers: corsHeaders })
    }

    webPush.setVapidDetails(
      'mailto:noreply@stepsacademy.com.br',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    )

    const payload = JSON.stringify({
      title: senderName,
      body: preview,
      icon: '/brand/pwa-icon.webp',
      badge: '/notification-icon.png',
      url: '/chat',
      tag: `chat-${msg.room_id}`,
    })

    let sent = 0
    let failed = 0

    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400, topic: `chat-${msg.room_id}` }
        )
        sent++
      } catch (err: any) {
        failed++
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }

    return new Response(JSON.stringify({ sent, failed }), { headers: corsHeaders })
  } catch (err: any) {
    console.error('[notify-chat-message]', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
