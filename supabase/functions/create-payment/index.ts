import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Edge Function: create-payment
// Chamada no Step 4 do /cadastro e no painel Admin (plano personalizado)
// Cria customer + charge/subscription no Woovi e retorna brCode + qrCodeImage

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function wooviBaseUrl(): string {
  return Deno.env.get("WOOVI_SANDBOX") === "true"
    ? "https://api.woovi-sandbox.com"
    : "https://api.woovi.com";
}

function wooviHeaders(): Record<string, string> {
  const key = Deno.env.get("WOOVI_API_KEY");
  if (!key) throw new Error("WOOVI_API_KEY não configurada");
  return {
    "Content-Type": "application/json",
    "Authorization": key,          // sem "Bearer"
  };
}

async function wooviPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${wooviBaseUrl()}${path}`, {
    method: "POST",
    headers: wooviHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    console.error(`[create-payment] Woovi ${path} error ${res.status}:`, text.slice(0, 400));
  }
  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Auth: verificar JWT do aluno ou do admin ───────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verificar usuário
  const { data: { user }, error: userError } = await sb.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (userError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const {
    student_id,
    nome,
    cpf,
    email,
    phone,
    billing_type,      // 'MONTHLY' | 'SEMIANNUAL'
    amount_cents,
    plan_id,
    frequency_per_week,
    idioma,
  } = body;

  if (!student_id || !nome || !cpf || !email || !billing_type || !amount_cents) {
    return new Response(
      JSON.stringify({ error: "Campos obrigatórios: student_id, nome, cpf, email, billing_type, amount_cents" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const cpfDigits = String(cpf).replace(/\D/g, "");
  const phoneDigits = String(phone ?? "").replace(/\D/g, "");

  try {
    // ── 1. Criar ou atualizar customer no Woovi ────────────────────────────
    await wooviPost("/api/v1/customer", {
      name: nome,
      taxID: cpfDigits,
      email,
      phone: phoneDigits || undefined,
      correlationID: student_id,   // student UUID como correlationID
    });

    // CPF fica em profiles (não em students)
    await sb.from("students")
      .update({ payment_customer_id: student_id })
      .eq("id", student_id);

    // ── 2. Criar cobrança ou assinatura ───────────────────────────────────
    const correlationID = crypto.randomUUID();
    let brCode = "";
    let qrCodeImage = "";
    let paymentLinkUrl = "";

    if (billing_type === "SEMIANNUAL") {
      // Charge avulsa — PIX à vista semestral
      const data = await wooviPost("/api/v1/charge", {
        correlationID,
        value: amount_cents,
        comment: `Steps Academy — Plano Semestral (6 meses)`,
        customer: { name: nome, taxID: cpfDigits, email, phone: phoneDigits || undefined },
        additionalInfo: [
          { key: "Plano", value: "Semestral" },
          { key: "Idioma", value: idioma ?? "—" },
          { key: "Frequência", value: `${frequency_per_week ?? "?"}x por semana` },
        ],
      });
      const charge = data.charge ?? data;
      brCode = charge.brCode ?? "";
      qrCodeImage = charge.qrCodeImage ?? "";
      paymentLinkUrl = charge.paymentLinkUrl ?? "";

    } else {
      // Subscription recorrente — PIX mensal
      const data = await wooviPost("/api/v1/subscriptions", {
        correlationID,
        name: `Steps Academy — ${frequency_per_week ?? "?"}x/semana`,
        value: amount_cents,
        comment: `Mensalidade Steps Academy`,
        type: "PIX_RECURRING",
        frequency: "MONTHLY",
        dayGenerateCharge: 5,
        dayDue: 7,
        customer: { name: nome, taxID: cpfDigits, email, phone: phoneDigits || undefined },
        pixRecurringOptions: {
          journey: "ONLY_RECURRENCY",
          retryPolicy: "NON_PERMITED",
        },
        additionalInfo: [
          { key: "Plano", value: "Mensal" },
          { key: "Idioma", value: idioma ?? "—" },
          { key: "Frequência", value: `${frequency_per_week ?? "?"}x por semana` },
        ],
      });
      const sub = data.subscription ?? data;
      brCode = sub.pixRecurring?.emv ?? sub.pixRecurring?.brCode ?? "";
      qrCodeImage = sub.pixRecurring?.qrCodeImage ?? "";
    }

    // ── 3. Persistir no DB ────────────────────────────────────────────────
    await sb.from("students").update({
      payment_subscription_id: correlationID,
    }).eq("id", student_id);

    // Upsert subscriptions (pode já existir se admin criou antes)
    await sb.from("subscriptions").upsert({
      student_id,
      plan_id: plan_id ?? null,
      billing_type,
      payment_method: "pix",
      amount_cents,
      status: "pending",
      gateway_subscription_id: correlationID,
    }, { onConflict: "student_id" });

    return new Response(
      JSON.stringify({ brCode, qrCodeImage, paymentLinkUrl, correlationID }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[create-payment] erro:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
