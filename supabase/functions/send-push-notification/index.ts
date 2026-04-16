import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return JSON.parse(atob(padded));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const jwtPayload = decodeJwtPayload(token);
    const callerId = jwtPayload.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (!callerProfile || !["admin", "teacher"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { student_id, title, body, url } = await req.json();
    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: "title e body são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // student_id is already the students.id (from the students table)
    // Filter subscriptions directly — no extra lookup needed
    let subsQuery = adminClient.from("push_subscriptions").select("*");
    if (student_id) {
      subsQuery = subsQuery.eq("student_id", student_id);
    }
    const { data: subscriptions } = await subsQuery;

    if (!subscriptions || subscriptions.length === 0) {
      console.log("[push] no subscriptions found for student_id:", student_id ?? "all");
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "Nenhuma subscription encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    console.log("[push] VAPID_PUBLIC_KEY prefix:", vapidPublic?.slice(0, 20));
    console.log("[push] subscriptions found:", subscriptions.length);

    webpush.setVapidDetails(
      "mailto:noreply@stepsacademy.com.br",
      vapidPublic,
      vapidPrivate
    );

    const notifPayload = JSON.stringify({
      title,
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      url: url || "/",
    });

    let sent = 0;
    let failed = 0;
    const errors: Array<{ status: number; message: string }> = [];

    for (const sub of subscriptions) {
      console.log("[push] sending to endpoint prefix:", sub.endpoint?.slice(0, 60));
      try {
        const result = await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notifPayload
        );
        console.log("[push] FCM status:", result?.statusCode ?? "ok");
        sent++;
        await adminClient.from("notification_log").insert({
          student_id: sub.student_id,
          type: "push",
          title,
          body,
          delivered: true,
        });
      } catch (e: unknown) {
        failed++;
        const err = e as { statusCode?: number; body?: string; message?: string };
        console.error("[push] FCM error:", err.statusCode, err.body ?? err.message);
        errors.push({ status: err.statusCode ?? 0, message: err.body ?? err.message ?? String(e) });
        if (err.statusCode === 410) {
          await adminClient.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    console.log("[push] done — sent:", sent, "failed:", failed);
    return new Response(
      JSON.stringify({ success: true, sent, failed, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[push] unexpected error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
