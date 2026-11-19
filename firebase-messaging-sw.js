// Service worker des notifications (Firebase Cloud Messaging)
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyBCoTYkIl1786h0J99s9qVXpoj9DCdATOY",
  authDomain: "mon-heroine.firebaseapp.com",
  projectId: "mon-heroine",
  storageBucket: "mon-heroine.firebasestorage.app",
  messagingSenderId: "574707720618",
  appId: "1:574707720618:web:319d95161ca14e98ae0bd3"
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  if (payload.notification) return; // déjà affichée par le navigateur
  self.registration.showNotification(d.title || "11 type OL", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", data: { url: d.url || "./" } });
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
