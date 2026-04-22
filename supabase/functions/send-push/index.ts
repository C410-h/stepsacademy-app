import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webPush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { student_id, title, body, url } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  webPush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!
  );

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("student_id", student_id);

  if (!subs?.length) {
    return new Response(
      JSON.stringify({ sent: 0, message: "no subscriptions" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ title, body, url })
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        expired.push(sub.id);
      } else {
        failed++;
        console.error("Push error:", err.statusCode, err.body);
      }
    }
  }

  if (expired.length) {
    await supabase.from("push_subscriptions").delete().in("id", expired);
  }

  return new Response(
    JSON.stringify({ sent, failed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
