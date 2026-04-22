import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.getRegistration("/sw.js") ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns true if the browser supports Web Push */
export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Returns true if the user already has an active push subscription */
export async function isPushSubscribed(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return sub !== null;
}

/**
 * Requests permission, registers SW, subscribes and saves to Supabase.
 * Pass studentId for students, profileId for admin/teacher.
 * Returns true on success, false on denial or error.
 */
export async function subscribeToPush(
  studentId: string | null,
  profileId?: string
): Promise<boolean> {
  if (!isPushSupported()) return false;

  // Ask for permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    // Register (or reuse) the service worker
    let reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js");
    }

    // Wait until the SW is active
    await navigator.serviceWorker.ready;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const p256dh = btoa(
      String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh")!))
    );
    const auth = btoa(
      String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!))
    );

    await (supabase as any).from("push_subscriptions").upsert(
      {
        ...(studentId ? { student_id: studentId } : {}),
        ...(profileId ? { profile_id: profileId } : {}),
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        device_label: navigator.userAgent.slice(0, 100),
      },
      { onConflict: "endpoint" }
    );

    return true;
  } catch (err) {
    console.error("subscribeToPush error:", err);
    return false;
  }
}

/** Cancels the push subscription and removes it from Supabase */
export async function unsubscribeFromPush(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;

  try {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;

    // Remove from DB first (best-effort)
    await (supabase as any)
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", sub.endpoint);

    await sub.unsubscribe();
    return true;
  } catch (err) {
    console.error("unsubscribeFromPush error:", err);
    return false;
  }
}
