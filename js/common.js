/* 루틴원 - 공통: Supabase 클라이언트 / 인증 가드 / 내비 / 테마 / 토스트 / 모달 / 포맷 */
(function () {
  "use strict";
  const CFG = self.K1D_CONFIG;
  const K1D = window.K1D = window.K1D || {};
  let client = null;

  K1D.sb = function () {
    if (client) return client;
    client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "k1d-auth" }
    });
    return client;
  };

  // ---- 테마 ----
  K1D.applyTheme = function () {
    let th = "system";
    try { th = localStorage.getItem("k1d-theme") || "system"; } catch (e) { /* 저장소 차단 */ }
    const dark = th === "dark" || (th === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    return th;
  };
  K1D.applyTheme();

  // ---- RPC ----
  K1D.rpc = async function (fn, args) {
    const { data, error } = await K1D.sb().rpc(fn, args || {});
    if (error) { console.error(fn, error); throw error; }
    return data;
  };

  // ---- 인증 가드: 로그인 필요 페이지에서 호출 ----
  K1D.requireLogin = async function () {
    const { data } = await K1D.sb().auth.getSession();
    if (!data.session) { location.replace("index.html"); return null; }
    K1D.session = data.session;
    try { K1D.me = await K1D.rpc("hc_me"); } catch (e) { K1D.toast(K1D.errMsg(e), "err"); throw e; }
    if (!K1D.me.consent_at || K1D.me.consent_version !== K1D.CONSENT_VERSION) await K1D.askConsent();
    if (K1D.push) setTimeout(() => K1D.push.ensure(), 1500);   // 어느 화면을 열든 알림 구독 자동 복구
    return K1D.me;
  };

  // ---- 개인정보 수집·이용 동의 (최초 1회, 방침 개정 시 다시) ----
  K1D.CONSENT_VERSION = "2026-11-06";
  K1D.askConsent = function () {
    return new Promise(resolve => {
      const back = document.createElement("div");
      back.className = "modal-back";
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <h2>개인정보 수집·이용 동의</h2>
        <p class="help">루틴원을 쓰려면 아래 두 가지에 동의가 필요합니다. 자세한 내용은 <a href="privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>을 확인하세요.</p>
        <div class="card">
          <label class="row pick"><input type="checkbox" id="cs-1"><div class="grow"><b>[필수] 개인정보 수집·이용</b>
            <div class="help">이메일, 표시 이름, 시간대, 체크 항목과 체크 기록, 알림 기기 정보 · 목적: 체크리스트 알림과 준수율 피드백 · 보관: 탈퇴 시 즉시 삭제</div></div></label>
        </div>
        <div class="card">
          <label class="row pick"><input type="checkbox" id="cs-2"><div class="grow"><b>[필수] 건강 관련 정보 처리</b>
            <div class="help">직접 입력하는 항목에 복약·혈압·체중 같은 건강 관련 내용이 포함될 수 있습니다. 본인 확인 용도로만 쓰며, 관리자를 포함한 다른 사람은 볼 수 없고 광고에 쓰지 않습니다.</div></div></label>
        </div>
        <label class="row mt pick"><input type="checkbox" id="cs-all"> <b>모두 동의</b></label>
        <div class="actions"><button class="btn" id="cs-no">동의하지 않음 (로그아웃)</button><button class="btn primary" id="cs-yes" disabled>동의하고 시작</button></div>
      </div>`;
      document.body.appendChild(back);
      const c1 = back.querySelector("#cs-1"), c2 = back.querySelector("#cs-2"), all = back.querySelector("#cs-all"), yes = back.querySelector("#cs-yes");
      const sync = () => { yes.disabled = !(c1.checked && c2.checked); all.checked = c1.checked && c2.checked; };
      c1.addEventListener("change", sync); c2.addEventListener("change", sync);
      all.addEventListener("change", () => { c1.checked = c2.checked = all.checked; sync(); });
      back.querySelector("#cs-no").addEventListener("click", K1D.logout);
      yes.addEventListener("click", async () => {
        yes.disabled = true;
        try { await K1D.rpc("hc_give_consent", { p_version: K1D.CONSENT_VERSION }); K1D.me.consent_at = new Date().toISOString(); K1D.me.consent_version = K1D.CONSENT_VERSION; back.remove(); resolve(); }
        catch (e) { yes.disabled = false; K1D.toast(K1D.errMsg(e), "err"); }
      });
    });
  };
  K1D.logout = async function () {
    try { await K1D.sb().auth.signOut(); } catch (e) { /* 무시 */ }
    location.replace("index.html");
  };

  // ---- 하단 내비 ----
  K1D.renderNav = function (active) {
    const tabs = [
      ["today", "today.html", "✓"], ["items", "items.html", "☰"],
      ["report", "report.html", "▤"], ["settings", "settings.html", "⚙"]
    ];
    const nav = document.createElement("nav");
    nav.className = "bottom-nav";
    nav.innerHTML = '<div class="inner">' + tabs.map(([k, href, ico]) =>
      `<a href="${href}" class="${k === active ? "active" : ""}"><span class="ico">${ico}</span><span>${K1D.t("nav." + k)}</span></a>`
    ).join("") + "</div>";
    document.body.appendChild(nav);
  };

  // ---- 토스트 ----
  let toastTimer = null;
  K1D.toast = function (msg, kind) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); document.body.appendChild(el); }
    el.className = "toast" + (kind === "err" ? " err" : "");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), kind === "err" ? 5000 : 2200);
  };
  K1D.errMsg = function (e) {
    if (!navigator.onLine) return K1D.t("common.offline");
    return (e && (e.message || e.error_description)) || K1D.t("common.error");
  };

  // ---- 모달 ----
  K1D.modal = function (html, onMount) {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener("click", ev => { if (ev.target === back) close(); });
    back.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    if (onMount) onMount(back.querySelector(".modal"), close);
    return close;
  };

  // ---- 포맷 ----
  K1D.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  K1D.pct = v => (v == null || isNaN(v)) ? "-" : Number(v).toFixed(1);     // % 는 소수 1자리
  K1D.int = v => (v == null || isNaN(v)) ? "-" : String(Math.round(Number(v)));  // 개수·일수는 정수
  K1D.hm = t => String(t || "").slice(0, 5);
  K1D.addDays = (ymd, n) => { const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  K1D.dateLabel = ymd => { const d = new Date(ymd + "T00:00:00Z"); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WD[d.getUTCDay()]})`; };
  K1D.daysLabel = days => {
    const s = (days || []).slice().sort().join(",");
    if (s === "1,2,3,4,5,6,7") return "매일";
    if (s === "1,2,3,4,5") return "평일";
    if (s === "6,7") return "주말";
    const names = ["", "월", "화", "수", "목", "금", "토", "일"];
    return (days || []).slice().sort().map(d => names[d]).join("·");
  };
  // 분류 체계 (9개 + 기존 호환). 순서 = 화면 정렬 순서, key = CSS 클래스
  K1D.CATEGORIES = [
    ["복약", "med"], ["건강측정", "meas"], ["운동", "ex"], ["식사·수분", "food"],
    ["수면", "sleep"], ["생활", "life"], ["마음 관리", "mind"], ["관계·가족", "rel"],
    ["학습·자기계발", "learn"], ["업무", "work"]
  ];
  K1D.catClass = c => { const f = K1D.CATEGORIES.find(x => x[0] === c); return "cat-" + (f ? f[1] : "etc"); };
  K1D.rateClass = v => v == null ? "" : (v >= 80 ? "good" : v >= 60 ? "mid" : "bad");
  K1D.localTime = (iso, tz) => {
    try { return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }); }
    catch (e) { return ""; }
  };
  K1D.nowHM = tz => {
    try { return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }); }
    catch (e) { return new Date().toTimeString().slice(0, 5); }
  };

  // ---- 하단 배너 (공지·홍보·광고) ----
  K1D.renderBanner = async function (holder) {
    if (!holder) return;
    try {
      const rows = await K1D.rpc("hc_banner");
      const b = rows && rows[0];
      if (!b) { holder.innerHTML = ""; return; }
      const kind = { notice: "공지", promo: "홍보", ad: "광고" }[b.kind] || "안내";
      const link = b.link_url ? ` <a href="${K1D.esc(b.link_url)}" target="_blank" rel="noopener sponsored">${K1D.esc(b.link_label || "자세히")}</a>` : "";
      holder.innerHTML = `<div class="banner"><span class="kind">${kind}</span><span class="txt">${K1D.esc(b.body)}${link}</span></div>`;
    } catch (e) { holder.innerHTML = ""; }
  };

  // ---- 응원 메시지 (룰 기반) ----
  K1D.renderFeedback = async function (holder) {
    if (!holder) return;
    try {
      const rows = await K1D.rpc("hc_feedback");
      if (!rows || !rows.length) { holder.innerHTML = ""; return; }
      const mood = K1D.ruti.moodOf(rows[0].rule_code);
      holder.innerHTML = `<div class="card feedback has-ruti">${K1D.ruti.html(mood, "ruti-sm")}<div class="fb-body">${rows.map(r =>
        `<div class="fb-rule">${K1D.esc(r.rule_name)}</div><div class="fb-msg">${K1D.esc(r.message)}</div>`).join("")}</div></div>`;
      K1D.ruti.bind(holder);
      if (K1D.ruti.pendingCheer) { K1D.ruti.pendingCheer = false; K1D.ruti.hop(holder.querySelector(".ruti")); }
    } catch (e) { holder.innerHTML = ""; }
  };

  // ---- 마스코트 루티 (SVG + CSS 애니메이션, 동작 줄이기 설정 시 정지) ----
  K1D.ruti = (function () {
    const L = "#2F4A6B", B = "#CFE4F7", CH = "#F8C9CF";
    const MOOD = { START: "wave", PERFECT_TODAY: "perfect", STREAK: "streak", RECOVERY: "thumb",
      DROP: "sleepy", MISS_ITEM: "miss", PERIOD_DONE: "medal", DEFAULT: "idle" };
    const EYES = {
      normal: `<g class="r-eyes"><ellipse cx="82" cy="86" rx="6" ry="8" fill="${L}"/><ellipse cx="118" cy="86" rx="6" ry="8" fill="${L}"/><circle cx="84" cy="83" r="2" fill="#fff"/><circle cx="120" cy="83" r="2" fill="#fff"/></g>`,
      happy: `<path d="M74,90 q8,-10 16,0 M110,90 q8,-10 16,0" stroke="${L}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      wink: `<ellipse cx="82" cy="86" rx="6" ry="8" fill="${L}"/><path d="M110,88 q8,-8 16,0" stroke="${L}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      sleepy: `<path d="M74,88 h16 M110,88 h16" stroke="${L}" stroke-width="5" stroke-linecap="round"/>`
    };
    const MOUTH = {
      check: `<path class="r-mouth" d="M88,108 l8,9 l17,-18" stroke="${L}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      flat: `<path class="r-mouth" d="M92,112 h16" stroke="${L}" stroke-width="4.5" stroke-linecap="round"/>`
    };
    const arm = (side) => {
      const x1 = side === "L" ? 50 : 150, x2 = side === "L" ? 28 : 172;
      return `<g class="r-arm r-arm${side}"><path d="M${x1},100 L${x2},118" stroke="${L}" stroke-width="5" stroke-linecap="round"/><circle cx="${x2}" cy="118" r="7" fill="${B}" stroke="${L}" stroke-width="3.5"/></g>`;
    };
    const EXTRA = {
      perfect: `<path class="r-fx r-star" d="M160,22 l4,9 l10,1 l-8,6 l3,10 l-9,-6 l-9,6 l3,-10 l-8,-6 l10,-1 z" fill="#F6D98B" stroke="#C9A646" stroke-width="2"/>`,
      streak: `<path class="r-fx r-flame" d="M100,4 c-14,14 -12,26 0,30 c12,-4 14,-16 0,-30 z" fill="#F9C9A0" stroke="#D08A55" stroke-width="2.5"/>`,
      thumb: `<path class="r-fx r-thumb" d="M178,92 v-12" stroke="${L}" stroke-width="5" stroke-linecap="round"/>`,
      sleepy: `<text class="r-fx r-zzz" x="150" y="40" font-size="20" font-weight="800" fill="#8AA4BF">z</text>`,
      miss: `<g class="r-fx r-card"><rect x="64" y="120" width="72" height="34" rx="6" fill="#fff" stroke="${L}" stroke-width="2.5"/><path d="M74,137 h10 M92,132 h36 M92,142 h24" stroke="#8AA4BF" stroke-width="3" stroke-linecap="round"/></g>`,
      medal: `<g class="r-fx r-medal"><path d="M82,117 l18,16 l18,-16" stroke="#7FB2DE" stroke-width="5" fill="none"/><circle cx="100" cy="145" r="13" fill="#F6D98B" stroke="#C9A646" stroke-width="2.5"/><text x="100" y="150" text-anchor="middle" font-size="13" font-weight="800" fill="#8A6A10">1</text></g>`
    };
    const FACE = { wave: ["wink", "check"], perfect: ["happy", "check"], streak: ["happy", "check"], thumb: ["normal", "check"],
      sleepy: ["sleepy", "flat"], miss: ["normal", "flat"], medal: ["happy", "check"], idle: ["normal", "check"] };

    function html(mood, size) {
      mood = FACE[mood] ? mood : "idle";
      const [e, m] = FACE[mood];
      return `<div class="ruti ${size || ""} m-${mood}" role="img" aria-label="마스코트 루티" title="루티">
        <svg viewBox="0 0 200 175" xmlns="http://www.w3.org/2000/svg"><g class="r-all">
          <ellipse cx="78" cy="164" rx="13" ry="8" fill="${B}" stroke="${L}" stroke-width="3.5"/><ellipse cx="122" cy="164" rx="13" ry="8" fill="${B}" stroke="${L}" stroke-width="3.5"/>
          <g class="r-up">${arm("L")}${arm("R")}
          <circle cx="100" cy="98" r="60" fill="${B}" stroke="${L}" stroke-width="4"/>
          <ellipse cx="66" cy="108" rx="9" ry="6" fill="${CH}"/><ellipse cx="134" cy="108" rx="9" ry="6" fill="${CH}"/>
          ${EYES[e]}${MOUTH[m]}</g>${EXTRA[mood] || ""}</g></svg></div>`;
    }
    function hop(el) {
      if (!el) return;
      el.classList.remove("hop"); void el.offsetWidth; el.classList.add("hop");
      setTimeout(() => el.classList.remove("hop"), 900);
    }
    function bind(root) {
      (root || document).querySelectorAll(".ruti").forEach(el => {
        if (el.dataset.bound) return; el.dataset.bound = "1";
        el.addEventListener("click", () => hop(el));
      });
    }
    function mount() {
      document.querySelectorAll("[data-ruti]").forEach(h => { h.innerHTML = html(h.dataset.ruti, h.dataset.size || "ruti-lg"); });
      bind(document);
    }
    document.addEventListener("DOMContentLoaded", mount);
    return { html, hop, bind, mount, moodOf: c => MOOD[c] || "idle", pendingCheer: false };
  })();

  // ---- 알림 상태 배너: 꺼져 있으면 바로 켜기 + 원인별 안내 (알림 기본 '켜짐' 유지) ----
  K1D.renderPushBanner = async function (holder) {
    if (!holder || !K1D.push) return;
    const state = await K1D.push.ensure();
    const standalone = K1D.push.isStandalone();
    if (state === "on") {
      holder.innerHTML = standalone ? "" :
        `<div class="card push-warn"><b>알림이 켜져 있습니다.</b> 다만 브라우저로 쓰면 Chrome이 일정 기간 뒤 알림 권한을 자동으로 끌 수 있습니다.
          <b>앱으로 설치</b>하면 자동으로 꺼지지 않습니다. <div class="row mt">${K1D.canInstall() ? '<button class="btn sm primary" id="pb-install">앱으로 설치</button>' : '<span class="help">Chrome ⋮ 메뉴 → "앱 설치" 또는 "홈 화면에 추가"</span>'}</div></div>`;
    } else {
      const why = {
        off: "알림이 꺼져 있어 정해진 시간에 알려 드릴 수 없습니다.",
        denied: "브라우저에서 알림이 차단되어 있습니다. 주소창 왼쪽 자물쇠(사이트 설정) → 알림 → <b>허용</b>으로 바꾼 뒤 아래 버튼을 누르세요.",
        unsupported: K1D.push.isIOS() ? "아이폰은 Safari 공유 버튼 → '홈 화면에 추가' 후, 홈 화면 아이콘으로 열어야 알림을 받을 수 있습니다." : "이 브라우저는 알림을 지원하지 않습니다. Chrome으로 열어 주세요."
      }[state] || "";
      holder.innerHTML = `<div class="card push-off"><b class="emph-red">알림이 꺼져 있습니다</b><div class="help">${why}</div>
        <div class="row wrap mt">${state !== "unsupported" ? '<button class="btn sm primary" id="pb-on">알림 켜기</button>' : ""}
        ${!standalone && K1D.canInstall() ? '<button class="btn sm" id="pb-install">앱으로 설치</button>' : ""}</div></div>`;
    }
    const on = holder.querySelector("#pb-on");
    if (on) on.addEventListener("click", async () => {
      try { await K1D.push.enable(); K1D.toast("알림을 켰습니다"); } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
      K1D.renderPushBanner(holder);
    });
    const ins = holder.querySelector("#pb-install");
    if (ins) ins.addEventListener("click", async () => { if (await K1D.install()) K1D.toast("설치되었습니다. 홈 화면의 루틴원 아이콘으로 여세요"); });
  };
  document.addEventListener("k1d-installable", () => { const h = document.getElementById("push-banner"); if (h) K1D.renderPushBanner(h); });

  // ---- 서비스워커 등록 (알림 액션 후 화면 새로고침 메시지 수신) ----
  K1D.registerSW = async function () {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      navigator.serviceWorker.addEventListener("message", ev => {
        if (ev.data && ev.data.type === "k1d-refresh" && typeof K1D.onRefresh === "function") K1D.onRefresh();
      });
      return reg;
    } catch (e) { console.warn("SW 등록 실패", e); return null; }
  };

  document.addEventListener("DOMContentLoaded", () => { if (K1D.applyI18n) K1D.applyI18n(); });
})();
