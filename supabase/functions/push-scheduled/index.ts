import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webPush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Horário de Brasília = UTC-3
const BRT_OFFSET = -3;

function getBRTHour(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const brtHour = ((utcHour + BRT_OFFSET) + 24) % 24;
  return `${String(brtHour).padStart(2, "0")}:${String(utcMinute).padStart(2, "0")}:00`;
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  webPush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!
  );

  const currentTime = getBRTHour();
  // Match HH:00:00 — ignora minutos para rodar de hora em hora
  const currentHour = currentTime.slice(0, 2) + ":00:00";

  console.log(`[push-scheduled] BRT time: ${currentTime}, matching hour: ${currentHour}`);

  // Busca settings habilitadas que batem com o horário atual
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("enabled", true)
    .eq("send_time", currentHour);

  if (!settings?.length) {
    console.log("[push-scheduled] Nenhuma notificação agendada para este horário.");
    return new Response(JSON.stringify({ skipped: true, hour: currentHour }), { status: 200 });
  }

  const results: Record<string, { sent: number; failed: number }> = {};

  for (const setting of settings) {
    console.log(`[push-scheduled] Processando tipo: ${setting.type}`);
    let studentIds: string[] = [];

    // Map student_id → template variables for personalised messages
    const studentVars = new Map<string, Record<string, string>>();

    if (setting.type === "daily_mission_reminder") {
      // Todos os alunos com pelo menos uma subscription
      const { data } = await supabase
        .from("push_subscriptions")
        .select("student_id");
      studentIds = [...new Set((data || []).map((r: any) => r.student_id).filter(Boolean))];

    } else if (setting.type === "streak_at_risk") {
      // Alunos com streak > 0 que não tiveram atividade hoje (BRT)
      const todayBRT = new Date();
      todayBRT.setUTCHours(todayBRT.getUTCHours() + BRT_OFFSET);
      const todayStr = todayBRT.toISOString().slice(0, 10);

      const { data } = await supabase
        .from("student_gamification")
        .select("student_id, streak_current, last_activity_date")
        .gt("streak_current", 0)
        .neq("last_activity_date", todayStr);

      // Guarda o streak de cada aluno para personalizar a mensagem
      for (const row of data || []) {
        studentVars.set(row.student_id, { streak: String(row.streak_current) });
      }

      // Só envia para quem tem subscription
      const atRiskIds = (data || []).map((r: any) => r.student_id);
      if (atRiskIds.length > 0) {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("student_id")
          .in("student_id", atRiskIds);
        studentIds = [...new Set((subs || []).map((r: any) => r.student_id).filter(Boolean))];
      }
    }

    if (!studentIds.length) {
      console.log(`[push-scheduled] Nenhum aluno elegível para ${setting.type}`);
      results[setting.type] = { sent: 0, failed: 0 };
      continue;
    }

    // Busca todas as subscriptions dos alunos elegíveis
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("student_id", studentIds);

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];

    for (const sub of subscriptions || []) {
      // Substitui variáveis do template: {{streak}}, {{name}}, etc.
      const vars = studentVars.get(sub.student_id) ?? {};
      const interpolate = (tpl: string) =>
        tpl.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? "");

      const title = interpolate(setting.title_template);
      const body = interpolate(setting.body_template);

      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: "/" })
        );
        sent++;

        // Grava no log
        await supabase.from("notification_log").insert({
          student_id: sub.student_id,
          type: setting.type,
          title,
          body,
          delivered: true,
        });
      } catch (err: any) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          expired.push(sub.id);
        }
        console.error(`[push-scheduled] Erro ao enviar para ${sub.student_id}:`, err.statusCode);
      }
    }

    // Limpa subscriptions expiradas
    if (expired.length) {
      await supabase.from("push_subscriptions").delete().in("id", expired);
    }

    results[setting.type] = { sent, failed };
    console.log(`[push-scheduled] ${setting.type}: sent=${sent}, failed=${failed}`);
  }

  return new Response(JSON.stringify({ hour: currentHour, results }), { status: 200 });
});
