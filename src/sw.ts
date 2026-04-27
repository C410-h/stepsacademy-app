/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// Activate new SW immediately and take control of all open tabs. Without
// this, users on a stale build keep loading old cached assets and can hit
// broken-bundle / white-screen issues until they manually close every tab.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = (event as PushEvent).data?.json() ?? {};
  (event as ExtendableEvent).waitUntil(
    self.registration.showNotification(data.title ?? "Steps Academy", {
      body: data.body ?? "",
      icon: "/brand/pwa-icon.webp",
      badge: "/notification-icon.png",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const e = event as NotificationEvent;
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? "/"));
});
