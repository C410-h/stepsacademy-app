import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webPush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WINDOW_DEFS = [
  { type: "class_reminder_30min", dbType: "class_reminder_30min", minOffset: 28, maxOffset: 32 },
  { type: "class_reminder_10min", dbType: "class_reminder_10min", minOffset:  8, maxOffset: 12 },
  { type: "class_reminder_start", dbType: "class_reminder_start", minOffset: -2, maxOffset:  2 },
] as const;

function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  webPush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!
  );

  // Load templates from DB
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("type, enabled, title_template, body_template")
    .in("type", WINDOW_DEFS.map((w) => w.dbType));

  const templateMap = new Map(
    (settings ?? []).map((s: any) => [s.type, s])
  );

  const now = new Date();
  const summary: Record<string, { sent: number; skipped: number; failed: number }> = {};

  for (const window of WINDOW_DEFS) {
    const tpl = templateMap.get(window.dbType);
    if (!tpl?.enabled) {
      summary[window.dbType] = { sent: 0, skipped: 0, failed: 0 };
      continue;
    }

    const lo = new Date(now.getTime() + window.minOffset * 60_000).toISOString();
    const hi = new Date(now.getTime() + window.maxOffset * 60_000).toISOString();

    // Two queries: can't use COALESCE in SDK filter chains
    const [scheduledRes, rescheduledRes] = await Promise.all([
      supabase
        .from("class_sessions")
        .select("id, student_id, meet_link, scheduled_at")
        .eq("status", "scheduled")
        .is("student_cancel_requested_at", null)
        .gte("scheduled_at", lo)
        .lte("scheduled_at", hi),
      supabase
        .from("class_sessions")
        .select("id, student_id, meet_link, rescheduled_at")
        .eq("status", "rescheduled")
        .is("student_cancel_requested_at", null)
        .gte("rescheduled_at", lo)
        .lte("rescheduled_at", hi),
    ]);

    const sessions = [
      ...(scheduledRes.data ?? []).map((s: any) => ({ ...s, class_time: s.scheduled_at })),
      ...(rescheduledRes.data ?? []).map((s: any) => ({ ...s, class_time: s.rescheduled_at })),
    ];

    if (!sessions.length) {
      summary[window.dbType] = { sent: 0, skipped: 0, failed: 0 };
      continue;
    }

    const sessionIds = sessions.map((s) => s.id);

    // Deduplication check
    const { data: alreadySent } = await supabase
      .from("class_session_notifications")
      .select("session_id")
      .eq("type", window.dbType)
      .in("session_id", sessionIds);

    const sentSet = new Set((alreadySent ?? []).map((r: any) => r.session_id));
    const pending = sessions.filter((s) => !sentSet.has(s.id));

    if (!pending.length) {
      summary[window.dbType] = { sent: 0, skipped: sessions.length, failed: 0 };
      continue;
    }

    // Fetch language names for each student
    const studentIds = [...new Set(pending.map((s) => s.student_id))];
    const { data: studentRows } = await supabase
      .from("students")
      .select("id, languages(name)")
      .in("id", studentIds);

    const langByStudent = new Map<string, string>();
    for (const row of studentRows ?? []) {
      const lang = (row as any).languages?.name ?? "";
      langByStudent.set(row.id, lang.toLowerCase());
    }

    // Fetch push subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, student_id, endpoint, p256dh, auth")
      .in("student_id", studentIds);

    const subsByStudent = new Map<string, typeof subs>();
    for (const sub of subs ?? []) {
      if (!subsByStudent.has(sub.student_id)) subsByStudent.set(sub.student_id, []);
      subsByStudent.get(sub.student_id)!.push(sub);
    }

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];
    const notified: string[] = [];

    for (const session of pending) {
      const studentSubs = subsByStudent.get(session.student_id) ?? [];
      const language = langByStudent.get(session.student_id) ?? "inglês";
      const minutes = String(Math.round((new Date(session.class_time).getTime() - now.getTime()) / 60_000));

      const title = interpolate(tpl.title_template, { language, minutes });
      const body  = interpolate(tpl.body_template,  { language, minutes });

      // For "start" type, deep-link directly to the Meet if available
      const url = window.dbType === "class_reminder_start" && session.meet_link
        ? session.meet_link
        : "/aulas";

      if (!studentSubs.length) {
        notified.push(session.id);
        continue;
      }

      let sessionSent = false;
      for (const sub of studentSubs) {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title, body, url })
          );
          sessionSent = true;
          sent++;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            expired.push(sub.id);
          } else {
            failed++;
            console.error(`[notify-class-reminders] push error ${err.statusCode}:`, err.body);
          }
        }
      }

      if (sessionSent) notified.push(session.id);
    }

    if (expired.length) {
      await supabase.from("push_subscriptions").delete().in("id", expired);
    }

    if (notified.length) {
      await supabase.from("class_session_notifications").insert(
        notified.map((id) => ({ session_id: id, type: window.dbType }))
      );
    }

    summary[window.dbType] = { sent, skipped: sentSet.size, failed };
    console.log(`[notify-class-reminders] ${window.dbType}: sent=${sent} skipped=${sentSet.size} failed=${failed}`);
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
