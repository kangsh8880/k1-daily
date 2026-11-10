/* K1 Daily Service Worker — 웹푸시 수신 / 알림 버튼([완료]·[30분 후]) 처리 / 최신 코드 우선 */
importScripts("js/config.js");
const CFG = self.K1D_CONFIG;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// 같은 출처의 HTML/JS/CSS 는 항상 네트워크 우선(옛 코드 고정 방지), 실패 시 캐시
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url; try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin === self.location.origin && /\.(html|js|css|webmanifest)$/.test(url.pathname)) {
    event.respondWith(fetch(req, { cache: "no-store" }).catch(() => caches.match(req)));
  }
});

self.addEventListener("push", event => {
  let d = {};
  try { d = event.data.json(); } catch (e) { d = { title: "K1 Daily", body: event.data ? event.data.text() : "" }; }
  const tokens = d.tokens || [];
  const actions = tokens.length
    ? [{ action: "done", title: tokens.length > 1 ? `모두 완료 (${tokens.length})` : "완료" }, { action: "snooze", title: "30분 후" }]
    : [];
  event.waitUntil(self.registration.showNotification(d.title || "K1 Daily", {
    body: d.body || "",
    tag: d.tag || "k1d",
    renotify: true,
    requireInteraction: tokens.length > 0,
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    vibrate: [200, 100, 200],
    actions,
    data: { tokens, url: d.url || "today.html" }
  }));
});

async function callRpc(fn, args) {
  const res = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(fn + " HTTP " + res.status);
  return res.json();
}

async function refreshClients() {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  list.forEach(c => c.postMessage({ type: "k1d-refresh" }));
}

self.addEventListener("notificationclick", event => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  if (event.action === "done" && data.tokens && data.tokens.length) {
    event.waitUntil(callRpc("hc_done_by_tokens", { p_tokens: data.tokens })
      .then(refreshClients)
      .catch(() => self.registration.showNotification("체크 저장 실패", { body: "앱을 열어 직접 체크해 주세요.", tag: "k1d-err", data: { url: "today.html" } })));
    return;
  }
  if (event.action === "snooze" && data.tokens && data.tokens.length) {
    event.waitUntil(callRpc("hc_snooze_by_tokens", { p_tokens: data.tokens, p_min: 30 }).catch(() => null));
    return;
  }
  const target = new URL(data.url || "today.html", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.postMessage({ type: "k1d-refresh" }); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});

// 브라우저가 푸시 구독을 만료·교체하면 새 구독으로 다시 등록 (로그인 없이 옛 구독 주소로 소유 확인)
function b64ToU8(base64) {
  const pad = "=".repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
self.addEventListener("pushsubscriptionchange", event => {
  const oldEp = event.oldSubscription && event.oldSubscription.endpoint;
  event.waitUntil((async () => {
    const sub = event.newSubscription ||
      await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.vapidPublicKey) });
    const j = sub.toJSON();
    if (oldEp) await callRpc("hc_replace_push", { p_old: oldEp, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  })().catch(() => null));
});
