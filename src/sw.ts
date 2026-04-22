/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener("push", (event) => {
  const data = (event as PushEvent).data?.json() ?? {};
  (event as ExtendableEvent).waitUntil(
    self.registration.showNotification(data.title ?? "Steps Academy", {
      body: data.body ?? "",
      icon: "/brand/pwa-icon.webp",
      badge: "/brand/pwa-icon.webp",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const e = event as NotificationEvent;
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? "/"));
});
