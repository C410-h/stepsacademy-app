import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications(studentId: string | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [acting, setActing] = useState(false);

  const refreshPermission = useCallback(() => {
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    refreshPermission();
    window.addEventListener("focus", refreshPermission);
    return () => window.removeEventListener("focus", refreshPermission);
  }, [refreshPermission]);

  const enable = useCallback(async () => {
    if (!studentId || acting) return;
    setActing(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      await (supabase as any).from("push_subscriptions").upsert(
        {
          student_id: studentId,
          endpoint: json.endpoint,
          p256dh: (json.keys as any).p256dh,
          auth: (json.keys as any).auth,
        },
        { onConflict: "student_id,endpoint" }
      );
    } finally {
      setActing(false);
    }
  }, [studentId, acting]);

  const disable = useCallback(async () => {
    if (!studentId || acting) return;
    setActing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await (supabase as any)
          .from("push_subscriptions")
          .delete()
          .eq("student_id", studentId)
          .eq("endpoint", sub.endpoint);
      }
      setPermission("default");
    } finally {
      setActing(false);
    }
  }, [studentId, acting]);

  return { permission, acting, enable, disable };
}
