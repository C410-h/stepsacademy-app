import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EMAILS = [
  'bi@allgreenconsulting.com',
  'careteam@allgreenconsulting.com',
  'closer2@allgreenconsulting.com',
  'hello@allgreenconsulting.com',
  'manager@allgreenconsulting.com',
  'marketing@allgreenconsulting.com',
  'office@allgreenconsulting.com',
  'projects@allgreenconsulting.com',
  'relationship@allgreenconsulting.com',
  'sales@allgreenconsulting.com',
  'sdr1@allgreenconsulting.com',
  'sdr2@allgreenconsulting.com',
  'sdr3@allgreenconsulting.com',
  'lopesfabricio@outlook.com.br',
]

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // Busca todos os usuários e filtra pelos emails
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500 })

  const results: any[] = []
  for (const user of users) {
    if (!EMAILS.includes(user.email ?? '')) continue
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password: 'Steps@2026' })
    results.push({ email: user.email, ok: !error, error: error?.message })
  }

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
