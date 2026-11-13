/* 루틴원 - 설정 (내 정보 / 알림 / 테마 / 로그아웃) */
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
    $("#sum-on").checked = !!me.summary_enabled;
    $("#sum-time").value = me.summary_time || "21:45";
    $("#btn-sum-save").addEventListener("click", saveSummary);
    $("#btn-export-occ").addEventListener("click", exportOcc);
    $("#btn-export-items").addEventListener("click", exportItems);
    $("#btn-withdraw").addEventListener("click", withdraw);

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
    await K1D.push.ensure();
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

  async function saveSummary() {
    try {
      await K1D.rpc("hc_update_summary", { p_enabled: $("#sum-on").checked, p_time: $("#sum-time").value || "21:45" });
      K1D.toast(K1D.t("common.saved"));
    } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
  }

  // ---- 내 데이터 내려받기 (CSV, 엑셀 한글 깨짐 방지 BOM) ----
  function download(name, rows) {
    const csv = rows.map(r => r.map(v => {
      const t = v == null ? "" : String(v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => K1D.me.today.replace(/-/g, "");
  const ST = { pending: "미완료", done: "완료", skip: "건너뜀" };

  async function exportOcc() {
    try {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await K1D.sb().from("hc_occ").select("occ_date,slot_time,title,category,status,done_at,via")
          .order("occ_date").order("slot_time").range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const tz = K1D.me.tz;
      download(`루틴원_체크기록_${stamp()}.csv`, [["날짜", "시간", "항목", "분류", "상태", "완료시각", "체크방법"]]
        .concat(all.map(r => [r.occ_date, K1D.hm(r.slot_time), r.title, r.category, ST[r.status] || r.status,
          r.done_at ? K1D.localTime(r.done_at, tz) : "", r.via === "push" ? "알림" : r.via === "web" ? "앱" : ""])));
      K1D.toast(`${all.length}건을 내려받았습니다`);
    } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
  }

  async function exportItems() {
    try {
      const { data, error } = await K1D.sb().from("hc_items").select("*").order("sort");
      if (error) throw error;
      download(`루틴원_항목_${stamp()}.csv`, [["항목", "분류", "시간", "요일", "시작일", "종료일", "재알림(분)", "메모", "상태"]]
        .concat(data.map(i => [i.title, i.category, i.times.map(K1D.hm).join(" "), K1D.daysLabel(i.days), i.start_date || "", i.end_date || "",
          i.remind_min, i.note || "", i.deleted_at ? "삭제됨" : i.active ? "사용" : "일시중지"])));
    } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
  }

  // ---- 회원 탈퇴 ----
  function withdraw() {
    K1D.modal(`<h2>회원 탈퇴</h2>
      <p>계정과 모든 데이터가 <b class="emph-red">즉시 삭제되고 되돌릴 수 없습니다.</b></p>
      <label class="lbl" for="wd-text">확인을 위해 <b>탈퇴</b> 라고 입력하세요</label>
      <input class="input" id="wd-text" autocomplete="off">
      <div class="actions"><button class="btn" data-close>취소</button><button class="btn danger" id="wd-go" disabled>탈퇴하기</button></div>`, (m, close) => {
      const inp = m.querySelector("#wd-text"), go = m.querySelector("#wd-go");
      inp.addEventListener("input", () => { go.disabled = inp.value.trim() !== "탈퇴"; });
      go.addEventListener("click", async () => {
        go.disabled = true;
        try { await K1D.push.disable(); } catch (e) { /* 기기 구독 해제 실패는 무시 (서버에서 삭제됨) */ }
        try {
          await K1D.rpc("hc_delete_account");
          try { localStorage.removeItem("k1d-auth"); } catch (e) { /* 무시 */ }
          close();
          alert("탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.");
          location.replace("index.html");
        } catch (e) { go.disabled = false; K1D.toast(K1D.errMsg(e), "err"); }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
