/* 루틴원 - 웹푸시 구독 / 해제 / 테스트 */
(function () {
  "use strict";
  const CFG = self.K1D_CONFIG;
  const K1D = window.K1D;

  function b64ToU8(base64) {
    const pad = "=".repeat((4 - base64.length % 4) % 4);
    const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  // 안드로이드 Chrome '앱 설치' 프롬프트 보관 (설치된 앱은 Chrome의 알림 자동 해제 대상에서 제외됨)
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; document.dispatchEvent(new Event("k1d-installable")); });
  K1D.canInstall = () => !!installEvt;
  K1D.install = async () => { if (!installEvt) return false; installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; return r.outcome === "accepted"; };

  K1D.push = {
    supported() { return ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window); },
    isIOS, isStandalone,
    async status() {
      if (!this.supported()) return { state: "unsupported" };
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      return { state: sub ? "on" : (Notification.permission === "denied" ? "denied" : "off"), permission: Notification.permission };
    },
    async enable() {
      if (!this.supported()) {
        throw new Error(isIOS() && !isStandalone()
          ? "아이폰은 Safari 공유 버튼 → '홈 화면에 추가' 후, 홈 화면 아이콘으로 열어야 알림을 켤 수 있습니다."
          : "이 브라우저는 웹 알림을 지원하지 않습니다.");
      }
      try { localStorage.removeItem("k1d-push-optout"); } catch (e) { /* 무시 */ }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("알림 권한이 허용되지 않았습니다. 브라우저 설정에서 알림을 허용해 주세요.");
      const reg = (await K1D.registerSW()) || (await navigator.serviceWorker.ready);
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.vapidPublicKey) });
      const j = sub.toJSON();
      await K1D.rpc("hc_save_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
      return true;
    },
    // 권한이 이미 허용된 기기는 앱을 열 때마다 구독을 자동 복구하고 서버에 다시 등록 (사용자 조작 없이)
    //  - 브라우저가 구독을 바꾸거나(만료·갱신), 서버가 만료 구독을 지운 경우를 모두 복구
    async ensure() {
      let optout = false;
      try { optout = localStorage.getItem("k1d-push-optout") === "1"; } catch (e) { /* 무시 */ }
      if (optout || !this.supported() || Notification.permission !== "granted") return (await this.status()).state;
      try {
        const reg = (await K1D.registerSW()) || (await navigator.serviceWorker.ready);
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.vapidPublicKey) });
        const j = sub.toJSON();
        await K1D.rpc("hc_save_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
        return "on";
      } catch (e) { console.warn("알림 자동 복구 실패", e); return (await this.status()).state; }
    },
    async disable() {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      try { localStorage.setItem("k1d-push-optout", "1"); } catch (e) { /* 사용자가 직접 끈 기기는 자동 복구하지 않음 */ }
      if (!sub) return;
      const ep = sub.endpoint;
      try { await sub.unsubscribe(); } catch (e) { /* 무시 */ }
      await K1D.rpc("hc_delete_push", { p_endpoint: ep });
    },
    async test() {
      const { data } = await K1D.sb().auth.getSession();
      const res = await fetch(`${CFG.supabaseUrl}/functions/v1/${CFG.pushFunction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + data.session.access_token },
        body: JSON.stringify({ mode: "test" })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || ("테스트 발송 실패 (HTTP " + res.status + ")"));
      if (body.failed) throw new Error(`발송 ${body.sent}건 성공, ${body.failed}건 실패: ${(body.errors || []).join(" / ")}`);
      return body;
    }
  };
})();
