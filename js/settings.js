/* K1 Daily - 설정 (내 정보 / 알림 / 테마 / 로그아웃) */
(function () {
  "use strict";
  const K1D = window.K1D;
  const $ = s => document.querySelector(s);
  const TZS = [["Asia/Ho_Chi_Minh", "베트남 (UTC+7)"], ["Asia/Seoul", "한국 (UTC+9)"], ["Asia/Bangkok", "태국 (UTC+7)"],
               ["Asia/Shanghai", "중국 (UTC+8)"], ["Asia/Tokyo", "일본 (UTC+9)"], ["America/Los_Angeles", "미국 서부"], ["Europe/London", "영국"]];

  async function init() {
    K1D.renderNav("settings");
    const me = await K1D.requireLogin();
    if (!me) return;
    $("#email").textContent = me.email || "";
    $("#name").value = me.display_name || "";
    $("#tz").innerHTML = TZS.concat(TZS.some(t => t[0] === me.tz) ? [] : [[me.tz, me.tz]])
      .map(([v, l]) => `<option value="${v}" ${v === me.tz ? "selected" : ""}>${l}</option>`).join("");
    $("#push-all").checked = !!me.push_enabled;
    $("#version").textContent = "v" + self.K1D_CONFIG.version;
    if (me.is_admin) $("#admin-link").classList.remove("hidden");

    $("#btn-save").addEventListener("click", saveProfile);
    $("#push-all").addEventListener("change", saveProfile);
    $("#btn-push-on").addEventListener("click", pushOn);
    $("#btn-push-test").addEventListener("click", pushTest);
    $("#btn-push-off").addEventListener("click", pushOff);
    $("#btn-logout").addEventListener("click", K1D.logout);

    let th = "system";
    try { th = localStorage.getItem("k1d-theme") || "system"; } catch (e) { /* 무시 */ }
    document.querySelectorAll("#theme button").forEach(b => {
      b.classList.toggle("on", b.dataset.th === th);
      b.addEventListener("click", () => {
        try { localStorage.setItem("k1d-theme", b.dataset.th); } catch (e) { /* 무시 */ }
        document.querySelectorAll("#theme button").forEach(x => x.classList.toggle("on", x === b));
        K1D.applyTheme();
      });
    });

    const ios = K1D.push.isIOS();
    $("#install-ios").classList.toggle("hidden", !ios);
    $("#install-android").classList.toggle("hidden", ios);
    await K1D.registerSW();
    refreshPush();
  }

  async function refreshPush() {
    const st = await K1D.push.status();
    const map = {
      on: ["이 기기에서 알림을 받고 있습니다", "emph-blue"],
      off: ["이 기기는 알림이 꺼져 있습니다", ""],
      denied: ["브라우저에서 알림이 차단되어 있습니다. 브라우저(사이트) 설정에서 알림을 허용해 주세요.", "emph-red"],
      unsupported: [K1D.push.isIOS() && !K1D.push.isStandalone()
        ? "아이폰은 '홈 화면에 추가' 후 홈 화면 아이콘으로 열어야 알림을 받을 수 있습니다."
        : "이 브라우저는 웹 알림을 지원하지 않습니다.", "emph-red"]
    };
    const [txt, cls] = map[st.state];
    $("#push-state").textContent = txt;
    $("#push-state").className = cls;
    $("#btn-push-on").classList.toggle("hidden", st.state === "on" || st.state === "unsupported");
    $("#btn-push-off").classList.toggle("hidden", st.state !== "on");
    $("#btn-push-test").disabled = st.state !== "on";
  }

  async function saveProfile() {
    try {
      await K1D.rpc("hc_update_profile", { p_name: $("#name").value.trim(), p_tz: $("#tz").value, p_push: $("#push-all").checked });
      K1D.toast(K1D.t("common.saved"));
    } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
  }
  async function pushOn() {
    try { await K1D.push.enable(); K1D.toast("알림을 켰습니다. '테스트 알림'으로 확인해 보세요."); }
    catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
    refreshPush();
  }
  async function pushTest() {
    const b = $("#btn-push-test"); b.disabled = true;
    try { const r = await K1D.push.test(); K1D.toast(`테스트 알림을 보냈습니다 (${r.sent}개 기기)`); }
    catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
    b.disabled = false;
  }
  async function pushOff() {
    try { await K1D.push.disable(); K1D.toast("이 기기 알림을 껐습니다"); }
    catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
    refreshPush();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
