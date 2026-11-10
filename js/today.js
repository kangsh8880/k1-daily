/* K1 Daily - 오늘 체크 */
(function () {
  "use strict";
  const K1D = window.K1D;
  const $ = s => document.querySelector(s);
  let today = null, viewDate = null, rows = [];

  async function init() {
    K1D.renderNav("today");
    const me = await K1D.requireLogin();
    if (!me) return;
    today = viewDate = me.today;
    K1D.registerSW();
    $("#prev").addEventListener("click", () => go(-1));
    $("#next").addEventListener("click", () => go(1));
    K1D.onRefresh = load;
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    setInterval(() => { if (!document.hidden) load(true); }, 60000);
    await load();
    if (!me.item_count) onboard();
    K1D.renderBanner($("#banner"));
    K1D.renderPushBanner($("#push-banner"));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) K1D.renderPushBanner($("#push-banner")); });
  }

  function go(n) {
    const d = K1D.addDays(viewDate, n);
    if (d > today || d < K1D.addDays(today, -6)) return;
    viewDate = d; load();
  }

  async function load(quiet) {
    try {
      rows = await K1D.rpc("hc_day", { p_date: viewDate });
      render();
      if (!quiet) K1D.renderFeedback($("#feedback"));
    } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
  }

  function render() {
    const tz = K1D.me.tz;
    const isToday = viewDate === today;
    const editable = viewDate >= K1D.addDays(today, -1);
    $("#date").textContent = K1D.dateLabel(viewDate) + (isToday ? " · 오늘" : "");
    $("#prev").disabled = viewDate <= K1D.addDays(today, -6);
    $("#next").disabled = viewDate >= today;
    $("#readonly").classList.toggle("hidden", editable);

    // KPI (서버 단일 산식과 동일: 지난 회차 + 미리 완료)
    const now = Date.now();
    const due = rows.filter(r => !isToday || new Date(r.slot_at).getTime() <= now || r.status !== "pending");
    const done = rows.filter(r => r.status === "done").length;
    const rate = due.length ? (100 * done / due.length) : null;
    const left = rows.filter(r => r.status === "pending" && (!isToday || new Date(r.slot_at).getTime() > now)).length;
    $("#k-rate").textContent = K1D.pct(rate);
    $("#k-rate-box").className = "kpi " + K1D.rateClass(rate);
    $("#k-done").textContent = K1D.int(done);
    $("#k-done-sub").textContent = "/ " + K1D.int(due.length) + " (지난 체크)";
    $("#k-left").textContent = isToday ? K1D.int(left) : "-";

    const list = $("#list");
    if (!rows.length) { list.innerHTML = `<div class="empty">${K1D.t("today.empty")}</div>`; return; }

    const nowHM = K1D.nowHM(tz);
    let nextSlot = null;
    if (isToday) { const nx = rows.find(r => K1D.hm(r.slot_time) >= nowHM && r.status === "pending"); nextSlot = nx ? K1D.hm(nx.slot_time) : null; }

    let html = "", cur = null;
    rows.forEach(r => {
      const hm = K1D.hm(r.slot_time);
      if (hm !== cur) {
        cur = hm;
        html += `<div class="slot ${hm === nextSlot ? "now" : ""}"><span class="t">${hm}</span><span class="line"></span>${hm === nextSlot ? '<span class="chip info">다음</span>' : ""}</div>`;
      }
      const passed = !isToday || new Date(r.slot_at).getTime() <= now;
      let cls = "", state = "";
      if (r.status === "done") { cls = "done"; state = K1D.t("today.doneAt", { time: K1D.localTime(r.done_at, tz) }) + (r.via === "push" ? " · 알림" : ""); }
      else if (r.status === "skip") { cls = "skip"; state = K1D.t("today.skip"); }
      else if (passed) { cls = "missed"; state = K1D.t("today.missed"); }
      else { state = K1D.t("today.upcoming"); }
      html += `<div class="task ${cls} ${editable ? "" : "readonly"}" data-id="${r.id}">
        <div class="chk">✓</div>
        <div class="body"><div class="title">${K1D.esc(r.title)}</div>
          <div class="note"><span class="chip ${K1D.catClass(r.category)}">${K1D.esc(r.category)}</span> ${K1D.esc(r.note || "")}</div></div>
        <div class="state">${state}</div>
        ${editable ? `<button class="icon-btn more" data-more="${r.id}" aria-label="더보기">⋯</button>` : ""}
      </div>`;
    });
    list.innerHTML = html;
    if (!editable) return;
    list.querySelectorAll(".task").forEach(el => el.addEventListener("click", ev => {
      if (ev.target.closest("[data-more]")) return;
      const r = rows.find(x => x.id === el.dataset.id);
      setStatus(r, r.status === "done" ? "pending" : "done");
    }));
    list.querySelectorAll("[data-more]").forEach(b => b.addEventListener("click", () => {
      const r = rows.find(x => x.id === b.dataset.more);
      K1D.modal(`<h2>${K1D.esc(r.title)}</h2><div class="sub">${K1D.hm(r.slot_time)} · ${K1D.esc(r.category)}</div>
        <div class="row wrap mt">
          <button class="btn success" data-s="done">완료</button>
          <button class="btn" data-s="skip">오늘은 건너뜀</button>
          <button class="btn ghost" data-s="pending">체크 취소</button>
        </div><p class="help">건너뜀은 준수율에서 미완료로 계산됩니다.</p>
        <div class="actions"><button class="btn" data-close>닫기</button></div>`, (m, close) => {
        m.querySelectorAll("[data-s]").forEach(x => x.addEventListener("click", () => { close(); setStatus(r, x.dataset.s); }));
      });
    }));
  }

  async function setStatus(r, status) {
    const prev = r.status;
    r.status = status; r.done_at = status === "pending" ? null : new Date().toISOString(); r.via = "web";
    render();
    try { await K1D.rpc("hc_set_status", { p_occ: r.id, p_status: status }); K1D.renderFeedback($("#feedback")); }
    catch (e) { r.status = prev; render(); K1D.toast(K1D.errMsg(e), "err"); }
  }

  async function onboard() {
    let tpls = [];
    try { const { data } = await K1D.sb().from("hc_templates").select("*").eq("active", true).order("sort"); tpls = data || []; } catch (e) { /* 무시 */ }
    if (!tpls.length) return;
    const tomorrow = K1D.addDays(today, 1);
    K1D.modal(`<h2>${K1D.t("today.onboardTitle")}</h2><p class="sub">${K1D.t("today.onboardDesc")}</p>
      ${tpls.map(t => `<label class="card row pick">
          <input type="checkbox" value="${K1D.esc(t.code)}" ${t.code === "lifestyle_basic" ? "checked" : ""}>
          <div class="grow"><b>${K1D.esc(t.name)}</b> <span class="chip">${(t.items || []).length}개</span>
            <div class="help">${K1D.esc(t.description || "")}</div>
            ${t.period_days ? `<div class="row mt"><span class="help">${K1D.t("today.startDate")} (${t.period_days}일)</span>
              <input type="date" class="input" data-start="${K1D.esc(t.code)}" value="${tomorrow}"></div>` : ""}
          </div></label>`).join("")}
      <div class="actions"><button class="btn" data-close>나중에</button><button class="btn primary" id="ob-apply">${K1D.t("today.apply")}</button></div>`,
    (m, close) => {
      m.querySelector("#ob-apply").addEventListener("click", async () => {
        const picks = [...m.querySelectorAll("input[type=checkbox]:checked")].map(x => x.value);
        if (!picks.length) { close(); return; }
        try {
          let n = 0;
          for (const code of picks) {
            const st = m.querySelector(`[data-start="${code}"]`);
            n += await K1D.rpc("hc_apply_template", { p_code: code, p_start: st ? st.value : null });
          }
          close(); K1D.toast(`${n}개 항목을 등록했습니다`); load();
        } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
