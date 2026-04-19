import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { name, email, language_id } = await req.json();

    if (!name || !email || !language_id) {
      return new Response(
        JSON.stringify({ success: false, error: "name, email e language_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const tempPassword = generateTempPassword();

    // 1. Create auth user
    const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (userErr || !userRes.user) {
      return new Response(
        JSON.stringify({ success: false, error: userErr?.message || "Erro ao criar usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = userRes.user.id;

    // 2. Set profile name and role (profile row is created automatically by auth trigger)
    await sb.from("profiles").update({ name, role: "teacher" }).eq("id", userId);

    // 3. Insert teacher row
    const { data: teacherRow, error: teacherErr } = await sb
      .from("teachers")
      .insert({ user_id: userId })
      .select("id")
      .single();

    if (teacherErr || !teacherRow) {
      return new Response(
        JSON.stringify({ success: false, error: teacherErr?.message || "Erro ao criar registro de professor" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Link teacher to language (triggers auto-allocation if this is the only teacher)
    await sb.from("teacher_languages").insert({
      teacher_id: teacherRow.id,
      language_id,
    });

    return new Response(
      JSON.stringify({ success: true, temp_password: tempPassword }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
