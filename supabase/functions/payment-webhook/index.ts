import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Webhook URL a configurar no painel Woovi:
// https://{PROJECT_REF}.supabase.co/functions/v1/payment-webhook
// Campo "authorization" no painel → salvar como WOOVI_WEBHOOK_TOKEN no Supabase Secrets

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 1. Validar token do Woovi
  const token = req.headers.get("x-webhook-token");
  if (token !== Deno.env.get("WOOVI_WEBHOOK_TOKEN")) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const eventType: string = body.event ?? "";
  if (!eventType) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing event field" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Extrair correlationID do payload (formatos diferentes por tipo de evento)
  const correlationID: string | null =
    body.charge?.correlationID ??
    body.subscription?.correlationID ??
    body.pixAutomatic?.correlationID ??
    null;

  if (!correlationID) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "no correlationID" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Idempotência — gateway_event_id = correlationID_eventType
  const gatewayEventId = `${correlationID}_${eventType}`;

  const { data: existing } = await sb
    .from("payment_events")
    .select("id")
    .eq("gateway_event_id", gatewayEventId)
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 3. Registrar evento
  await sb.from("payment_events").insert({
    gateway_event_id: gatewayEventId,
    event_type: eventType,
    payload: body,
  });

  // Helper: busca student_id pelo payment_subscription_id
  const getStudentId = async (): Promise<string | null> => {
    const { data } = await sb
      .from("students")
      .select("id")
      .eq("payment_subscription_id", correlationID)
      .maybeSingle();
    return data?.id ?? null;
  };

  // Datas úteis
  const nowIso = new Date().toISOString();
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  const endsAt = sixMonthsLater.toISOString().split("T")[0];

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(5);
  const nextDueDate = nextMonth.toISOString().split("T")[0];

  // 4. Processar evento
  switch (eventType) {
    // ── PIX avulso confirmado (semestral) ─────────────────────────────────────
    case "OPENPIX:CHARGE_COMPLETED":
    case "OPENPIX:TRANSACTION_RECEIVED": {
      await sb.from("students")
        .update({ payment_status: "active", overdue_since: null })
        .eq("payment_subscription_id", correlationID);

      await sb.from("subscriptions")
        .update({ status: "active", ends_at: endsAt })
        .eq("gateway_subscription_id", correlationID);

      const sid = await getStudentId();
      if (sid) {
        await sb.from("payments").insert({
          student_id: sid,
          status: "paid",
          payment_method: "pix",
          amount_cents: body.charge?.value ?? null,
          paid_at: nowIso,
          provider: "woovi",
          provider_id: correlationID,
        });
      }
      // TODO: push notification de confirmação
      break;
    }

    // ── PIX recorrente mensal pago ────────────────────────────────────────────
    case "PIX_AUTOMATIC_COBR_COMPLETED":
    case "PIX_AUTOMATIC_APPROVED": {
      await sb.from("students")
        .update({ payment_status: "active", overdue_since: null })
        .eq("payment_subscription_id", correlationID);

      await sb.from("subscriptions")
        .update({ status: "active", next_due_date: nextDueDate })
        .eq("gateway_subscription_id", correlationID);

      const sid = await getStudentId();
      if (sid) {
        await sb.from("payments").insert({
          student_id: sid,
          status: "paid",
          payment_method: "pix",
          amount_cents: body.pixAutomatic?.value ?? null,
          paid_at: nowIso,
          provider: "woovi",
          provider_id: correlationID,
        });
      }
      // TODO: push notification de confirmação
      break;
    }

    // ── Charge PIX expirou sem pagamento ──────────────────────────────────────
    case "OPENPIX:CHARGE_EXPIRED": {
      await sb.from("students")
        .update({ payment_status: "overdue", overdue_since: nowIso })
        .eq("payment_subscription_id", correlationID);

      await sb.from("subscriptions")
        .update({ status: "overdue" })
        .eq("gateway_subscription_id", correlationID);
      // TODO: push notification de alerta
      break;
    }

    // ── Cobrança recorrente rejeitada (inadimplência) ─────────────────────────
    case "PIX_AUTOMATIC_COBR_REJECTED":
    case "PIX_AUTOMATIC_REJECTED": {
      await sb.from("students")
        .update({ payment_status: "overdue", overdue_since: nowIso })
        .eq("payment_subscription_id", correlationID);

      await sb.from("subscriptions")
        .update({ status: "overdue" })
        .eq("gateway_subscription_id", correlationID);
      // TODO: push notification de alerta
      break;
    }

    default:
      // Evento registrado, sem ação adicional
      break;
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
