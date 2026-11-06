/* K1 Daily - 항목 관리 (추가·수정·일시중지·삭제, 추천 세트) */
(function () {
  "use strict";
  const K1D = window.K1D;
  const $ = s => document.querySelector(s);
  const CATS = K1D.CATEGORIES.map(c => c[0]);
  const DAYN = ["", "월", "화", "수", "목", "금", "토", "일"];
  let items = [];

  async function init() {
    K1D.renderNav("items");
    const me = await K1D.requireLogin();
    if (!me) return;
    $("#btn-add").addEventListener("click", () => edit(null));
    $("#btn-tpl").addEventListener("click", templates);
    await load();
  }

  async function load() {
    const { data, error } = await K1D.sb().from("hc_items").select("*").is("deleted_at", null).order("sort").order("created_at");
    if (error) { K1D.toast(K1D.errMsg(error), "err"); return; }
    items = data || [];
    render();
  }

  function periodState(it) {
    const t = K1D.me.today;
    if (it.end_date && it.end_date < t) return { cls: "warn", txt: "기간 종료" };
    if (it.start_date && it.start_date > t) return { cls: "info", txt: "시작 전" };
    return null;
  }

  function render() {
    const box = $("#list");
    if (!items.length) { box.innerHTML = `<div class="empty">${K1D.t("items.empty")}<br><br><button class="btn primary" id="e-tpl">${K1D.t("items.template")} 불러오기</button></div>`; $("#e-tpl").addEventListener("click", templates); return; }
    const groups = {};
    items.forEach(it => { (groups[it.category] = groups[it.category] || []).push(it); });
    const order = Object.keys(groups).sort((a, b) => (CATS.indexOf(a) + 99 * (CATS.indexOf(a) < 0)) - (CATS.indexOf(b) + 99 * (CATS.indexOf(b) < 0)));
    $("#count").textContent = `${items.length}개 항목 · 하루 ${items.filter(i => i.active).reduce((s, i) => s + i.times.length, 0)}회 체크`;
    box.innerHTML = order.map(cat => `<div class="group-title">${K1D.esc(cat)} (${groups[cat].length})</div>` +
      groups[cat].map(it => {
        const ps = periodState(it);
        const times = it.times.slice().sort().map(t => `<span class="chip">${K1D.hm(t)}</span>`).join("");
        const period = (it.start_date || it.end_date) ? ` · ${it.start_date || ""} ~ ${it.end_date || ""}` : "";
        return `<div class="card item-card ${it.active ? "" : "paused"}">
          <div class="grow"><div class="row wrap"><b>${K1D.esc(it.title)}</b>
            ${it.active ? "" : '<span class="chip warn">일시중지</span>'}${ps ? `<span class="chip ${ps.cls}">${ps.txt}</span>` : ""}</div>
            <div class="times">${times}</div>
            <div class="help mt">${K1D.daysLabel(it.days)}${period} · 재알림 ${it.remind_min ? it.remind_min + "분" : "없음"}${it.note ? " · " + K1D.esc(it.note) : ""}</div>
          </div>
          <button class="btn sm" data-edit="${it.id}">수정</button>
        </div>`;
      }).join("")).join("");
    box.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => edit(items.find(i => i.id === b.dataset.edit))));
  }

  function edit(it) {
    const isNew = !it;
    const v = it || { title: "", category: "생활", times: ["09:00"], days: [1, 2, 3, 4, 5, 6, 7], start_date: null, end_date: null, remind_min: 30, note: "", active: true };
    const catOpts = CATS.concat(CATS.includes(v.category) ? [] : [v.category]).map(c => `<option ${c === v.category ? "selected" : ""}>${K1D.esc(c)}</option>`).join("");
    K1D.modal(`<h2>${isNew ? K1D.t("items.new") : K1D.t("items.edit")}</h2>
      ${isNew ? "" : `<p class="help">${K1D.t("items.ruleNote")}</p>`}
      <label class="lbl">${K1D.t("items.name")}</label><input class="input" id="f-title" maxlength="80" value="${K1D.esc(v.title)}" placeholder="예: 혈압약 복용">
      <label class="lbl">${K1D.t("items.category")}</label><select class="input" id="f-cat">${catOpts}</select>
      <label class="lbl">${K1D.t("items.times")}</label><div id="f-times"></div>
      <button class="btn sm" id="f-addtime" type="button">${K1D.t("items.addTime")}</button>
      <label class="lbl">${K1D.t("items.days")}</label>
      <div class="days" id="f-days">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button type="button" data-d="${d}" class="${v.days.includes(d) ? "on" : ""}">${DAYN[d]}</button>`).join("")}</div>
      <div class="row mt"><button class="btn sm" data-q="1,2,3,4,5,6,7" type="button">매일</button><button class="btn sm" data-q="1,2,3,4,5" type="button">평일</button><button class="btn sm" data-q="6,7" type="button">주말</button></div>
      <label class="lbl">${K1D.t("items.period")}</label>
      <div class="row"><input type="date" class="input" id="f-start" value="${v.start_date || ""}"><span>~</span><input type="date" class="input" id="f-end" value="${v.end_date || ""}"></div>
      <label class="lbl">${K1D.t("items.remind")}</label>
      <select class="input" id="f-remind">${[0, 10, 30, 60].map(m => `<option value="${m}" ${m === v.remind_min ? "selected" : ""}>${m ? m + "분 후 1회" : "없음"}</option>`).join("")}</select>
      <label class="lbl">${K1D.t("items.note")}</label><input class="input" id="f-note" maxlength="200" value="${K1D.esc(v.note || "")}" placeholder="예: 식후 30분">
      <div class="actions">
        ${isNew ? "" : `<button class="btn danger" id="f-del">${K1D.t("items.delete")}</button><button class="btn" id="f-pause">${v.active ? K1D.t("items.pause") : K1D.t("items.resume")}</button>`}
        <span class="grow"></span>
        <button class="btn" data-close>${K1D.t("items.cancel")}</button><button class="btn primary" id="f-save">${K1D.t("items.save")}</button>
      </div>`, (m, close) => {
      const tbox = m.querySelector("#f-times");
      const addTime = t => {
        const row = document.createElement("div");
        row.className = "time-row";
        row.innerHTML = `<input type="time" class="input" value="${K1D.hm(t)}"><button type="button" class="icon-btn" aria-label="삭제">✕</button>`;
        row.querySelector("button").addEventListener("click", () => { if (tbox.children.length > 1) row.remove(); });
        tbox.appendChild(row);
      };
      v.times.slice().sort().forEach(addTime);
      m.querySelector("#f-addtime").addEventListener("click", () => { if (tbox.children.length < 12) addTime("12:00"); });
      m.querySelectorAll("#f-days button").forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));
      m.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => {
        const q = b.dataset.q.split(",");
        m.querySelectorAll("#f-days button").forEach(x => x.classList.toggle("on", q.includes(x.dataset.d)));
      }));

      m.querySelector("#f-save").addEventListener("click", async () => {
        const title = m.querySelector("#f-title").value.trim();
        const times = [...new Set([...tbox.querySelectorAll("input")].map(i => i.value).filter(Boolean))].sort();
        const days = [...m.querySelectorAll("#f-days button.on")].map(b => Number(b.dataset.d));
        const start = m.querySelector("#f-start").value || null, end = m.querySelector("#f-end").value || null;
        if (!title) return K1D.toast("이름을 입력해 주세요", "err");
        if (!times.length) return K1D.toast("알림 시간을 1개 이상 넣어 주세요", "err");
        if (!days.length) return K1D.toast("요일을 1개 이상 선택해 주세요", "err");
        if (start && end && start > end) return K1D.toast("기간 시작일이 종료일보다 늦습니다", "err");
        const rec = { title, category: m.querySelector("#f-cat").value, times, days, start_date: start, end_date: end,
          remind_min: Number(m.querySelector("#f-remind").value), note: m.querySelector("#f-note").value.trim() || null };
        const q = isNew
          ? K1D.sb().from("hc_items").insert(Object.assign(rec, { sort: (items.reduce((s, i) => Math.max(s, i.sort), 0) + 1) }))
          : K1D.sb().from("hc_items").update(rec).eq("id", it.id);
        const { error } = await q;
        if (error) return K1D.toast(K1D.errMsg(error), "err");
        close(); K1D.toast(K1D.t("common.saved")); load();
      });
      if (!isNew) {
        m.querySelector("#f-del").addEventListener("click", async () => {
          if (!confirm(K1D.t("items.confirmDelete", { title: it.title }))) return;
          const { error } = await K1D.sb().from("hc_items").update({ deleted_at: new Date().toISOString() }).eq("id", it.id);
          if (error) return K1D.toast(K1D.errMsg(error), "err");
          close(); K1D.toast("삭제했습니다"); load();
        });
        m.querySelector("#f-pause").addEventListener("click", async () => {
          const { error } = await K1D.sb().from("hc_items").update({ active: !it.active }).eq("id", it.id);
          if (error) return K1D.toast(K1D.errMsg(error), "err");
          close(); load();
        });
      }
    });
  }

  async function templates() {
    const { data, error } = await K1D.sb().from("hc_templates").select("*").eq("active", true).order("sort");
    if (error) return K1D.toast(K1D.errMsg(error), "err");
    const used = new Set(items.map(i => i.template_code).filter(Boolean));
    const tomorrow = K1D.addDays(K1D.me.today, 1);
    K1D.modal(`<h2>${K1D.t("items.template")}</h2><p class="help">세트를 불러오면 항목이 추가됩니다. 이미 불러온 세트는 다시 불러오면 중복됩니다.</p>
      ${(data || []).map(t => `<div class="card"><div class="row between"><b>${K1D.esc(t.name)}</b>
          ${used.has(t.code) ? '<span class="chip info">사용 중</span>' : ""}</div>
        <div class="help">${K1D.esc(t.description || "")}</div>
        <div class="help mt">${(t.items || []).map(x => K1D.esc(x.title) + " " + (x.times || []).join("·")).join(" / ")}</div>
        <div class="row mt">${t.period_days ? `<input type="date" class="input" data-start="${K1D.esc(t.code)}" value="${tomorrow}">` : '<span class="grow"></span>'}
          <button class="btn sm primary" data-apply="${K1D.esc(t.code)}">불러오기</button></div></div>`).join("")}
      <div class="actions"><button class="btn" data-close>닫기</button></div>`, (m, close) => {
      m.querySelectorAll("[data-apply]").forEach(b => b.addEventListener("click", async () => {
        const code = b.dataset.apply;
        if (used.has(code) && !confirm("이미 불러온 세트입니다. 한 번 더 추가할까요?")) return;
        const st = m.querySelector(`[data-start="${code}"]`);
        try {
          const n = await K1D.rpc("hc_apply_template", { p_code: code, p_start: st ? st.value : null });
          close(); K1D.toast(`${n}개 항목을 추가했습니다`); load();
        } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
      }));
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
