/* 루틴원 - 관리자 (중앙: 사람 대신 룰) — 응원 메시지 / 하단 배너 / 룰 기준
   개인 체크 항목·결과는 관리자도 볼 수 없음 (RLS) */
(function () {
  "use strict";
  const K1D = window.K1D;
  const $ = s => document.querySelector(s);
  let rules = [], tab = "msg";

  async function init() {
    K1D.renderNav("settings");
    const me = await K1D.requireLogin();
    if (!me) return;
    if (!me.is_admin) { $("#main").innerHTML = '<div class="empty">관리자만 사용할 수 있습니다.</div>'; return; }
    const { data } = await K1D.sb().from("hc_rules").select("*").order("priority");
    rules = data || [];
    document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
      tab = b.dataset.tab;
      document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
      show();
    }));
    show();
  }

  const ruleName = c => (rules.find(r => r.code === c) || {}).name || c;
  const dateRange = r => (r.valid_from || r.valid_to) ? `${r.valid_from || "…"} ~ ${r.valid_to || "…"}` : "상시";

  function show() {
    ["msg", "banner", "rule"].forEach(t => $("#tab-" + t).classList.toggle("hidden", t !== tab));
    if (tab === "msg") loadMessages();
    if (tab === "banner") loadBanners();
    if (tab === "rule") renderRules();
  }

  // ---------- 응원 메시지 ----------
  async function loadMessages() {
    const sel = $("#msg-rule");
    if (!sel.options.length) {
      sel.innerHTML = rules.map(r => `<option value="${r.code}">${K1D.esc(r.name)} (${r.code})</option>`).join("");
      sel.value = rules.length ? rules[0].code : "";   // 첫 항목 자동 선택
      sel.addEventListener("change", loadMessages);
      $("#msg-add").addEventListener("click", () => editMessage(null));
    }
    const r = rules.find(x => x.code === sel.value);
    $("#msg-rule-desc").textContent = r ? r.description || "" : "";
    const { data, error } = await K1D.sb().from("hc_messages").select("*").eq("rule_code", sel.value).order("id");
    if (error) return K1D.toast(K1D.errMsg(error), "err");
    $("#msg-list").innerHTML = (data || []).length ? `<table class="tbl"><thead><tr><th>메시지</th><th>노출 기간</th><th>상태</th><th></th></tr></thead><tbody>
      ${data.map(m => `<tr><td>${K1D.esc(m.body)}</td><td>${dateRange(m)}</td><td>${m.active ? "사용" : '<span class="emph-red">중지</span>'}</td>
        <td><button class="btn sm" data-id="${m.id}">수정</button></td></tr>`).join("")}</tbody></table>`
      : '<div class="empty">등록된 메시지가 없습니다</div>';
    $("#msg-list").querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => editMessage(data.find(m => String(m.id) === b.dataset.id))));
  }

  function editMessage(m) {
    const isNew = !m;
    const v = m || { rule_code: $("#msg-rule").value, body: "", active: true, valid_from: null, valid_to: null };
    K1D.modal(`<h2>${isNew ? "메시지 추가" : "메시지 수정"} · ${K1D.esc(ruleName(v.rule_code))}</h2>
      <p class="help">변수: {이름} {준수율} {7일준수율} {연속일수} {항목} {3일평균}</p>
      <label class="lbl">메시지</label><textarea class="input" id="m-body" maxlength="300">${K1D.esc(v.body)}</textarea>
      <label class="lbl">노출 기간 (비우면 상시)</label>
      <div class="row"><input type="date" class="input" id="m-from" value="${v.valid_from || ""}"><span>~</span><input type="date" class="input" id="m-to" value="${v.valid_to || ""}"></div>
      <label class="row mt"><input type="checkbox" id="m-active" ${v.active ? "checked" : ""}> 사용</label>
      <div class="actions">${isNew ? "" : '<button class="btn danger" id="m-del">삭제</button>'}<span class="grow"></span>
        <button class="btn" data-close>취소</button><button class="btn primary" id="m-save">저장</button></div>`, (md, close) => {
      md.querySelector("#m-save").addEventListener("click", async () => {
        const rec = { rule_code: v.rule_code, body: md.querySelector("#m-body").value.trim(), active: md.querySelector("#m-active").checked,
          valid_from: md.querySelector("#m-from").value || null, valid_to: md.querySelector("#m-to").value || null, updated_at: new Date().toISOString() };
        if (!rec.body) return K1D.toast("메시지를 입력해 주세요", "err");
        const { error } = isNew ? await K1D.sb().from("hc_messages").insert(rec) : await K1D.sb().from("hc_messages").update(rec).eq("id", m.id);
        if (error) return K1D.toast(K1D.errMsg(error), "err");
        close(); K1D.toast(K1D.t("common.saved")); loadMessages();
      });
      if (!isNew) md.querySelector("#m-del").addEventListener("click", async () => {
        if (!confirm("이 메시지를 삭제할까요?")) return;
        const { error } = await K1D.sb().from("hc_messages").delete().eq("id", m.id);
        if (error) return K1D.toast(K1D.errMsg(error), "err");
        close(); loadMessages();
      });
    });
  }

  // ---------- 하단 배너 ----------
  async function loadBanners() {
    if (!$("#banner-add").dataset.bound) { $("#banner-add").dataset.bound = "1"; $("#banner-add").addEventListener("click", () => editBanner(null)); }
    const { data, error } = await K1D.sb().from("hc_banners").select("*").order("id", { ascending: false });
    if (error) return K1D.toast(K1D.errMsg(error), "err");
    const kind = { notice: "공지", promo: "홍보", ad: "광고" };
    $("#banner-list").innerHTML = (data || []).length ? `<table class="tbl"><thead><tr><th>구분</th><th>문구</th><th class="num">가중치</th><th>노출 기간</th><th>상태</th><th></th></tr></thead><tbody>
      ${data.map(b => `<tr><td>${kind[b.kind]}</td><td>${K1D.esc(b.body)}${b.link_url ? `<div class="help">${K1D.esc(b.link_url)}</div>` : ""}</td>
        <td class="num">${K1D.int(b.weight)}</td><td>${dateRange(b)}</td><td>${b.active ? "사용" : '<span class="emph-red">중지</span>'}</td>
        <td><button class="btn sm" data-id="${b.id}">수정</button></td></tr>`).join("")}</tbody></table>`
      : '<div class="empty">등록된 배너가 없습니다</div>';
    $("#banner-list").querySelectorAll("[data-id]").forEach(x => x.addEventListener("click", () => editBanner(data.find(b => String(b.id) === x.dataset.id))));
  }

  function editBanner(b) {
    const isNew = !b;
    const v = b || { kind: "notice", body: "", link_url: "", link_label: "", weight: 1, active: true, valid_from: null, valid_to: null };
    K1D.modal(`<h2>${isNew ? "배너 추가" : "배너 수정"}</h2>
      <p class="help">피드백 화면(오늘·리포트) 하단에만 1개 노출됩니다. 푸시·메일에는 넣지 않습니다.</p>
      <label class="lbl">구분</label><select class="input" id="b-kind">
        ${[["notice", "공지"], ["promo", "홍보"], ["ad", "광고"]].map(([k, l]) => `<option value="${k}" ${k === v.kind ? "selected" : ""}>${l}</option>`).join("")}</select>
      <label class="lbl">문구</label><textarea class="input" id="b-body" maxlength="200">${K1D.esc(v.body)}</textarea>
      <label class="lbl">링크 주소 (선택)</label><input class="input" id="b-url" value="${K1D.esc(v.link_url || "")}" placeholder="https://">
      <label class="lbl">링크 글자 (선택)</label><input class="input" id="b-label" value="${K1D.esc(v.link_label || "")}" placeholder="자세히">
      <label class="lbl">가중치 (1~100, 클수록 자주 노출)</label><input type="number" min="1" max="100" class="input" id="b-weight" value="${v.weight}">
      <label class="lbl">노출 기간 (비우면 상시)</label>
      <div class="row"><input type="date" class="input" id="b-from" value="${v.valid_from || ""}"><span>~</span><input type="date" class="input" id="b-to" value="${v.valid_to || ""}"></div>
      <label class="row mt"><input type="checkbox" id="b-active" ${v.active ? "checked" : ""}> 사용</label>
      <div class="actions">${isNew ? "" : '<button class="btn danger" id="b-del">삭제</button>'}<span class="grow"></span>
        <button class="btn" data-close>취소</button><button class="btn primary" id="b-save">저장</button></div>`, (md, close) => {
      md.querySelector("#b-save").addEventListener("click", async () => {
        const url = md.querySelector("#b-url").value.trim();
        if (url && !/^https?:\/\//i.test(url)) return K1D.toast("링크는 http:// 또는 https:// 로 시작해야 합니다", "err");
        const rec = { kind: md.querySelector("#b-kind").value, body: md.querySelector("#b-body").value.trim(), link_url: url || null,
          link_label: md.querySelector("#b-label").value.trim() || null, weight: Math.min(100, Math.max(1, Number(md.querySelector("#b-weight").value) || 1)),
          active: md.querySelector("#b-active").checked, valid_from: md.querySelector("#b-from").value || null,
          valid_to: md.querySelector("#b-to").value || null, updated_at: new Date().toISOString() };
        if (!rec.body) return K1D.toast("문구를 입력해 주세요", "err");
        const { error } = isNew ? await K1D.sb().from("hc_banners").insert(rec) : await K1D.sb().from("hc_banners").update(rec).eq("id", b.id);
        if (error) return K1D.toast(K1D.errMsg(error), "err");
        close(); K1D.toast(K1D.t("common.saved")); loadBanners();
      });
      if (!isNew) md.querySelector("#b-del").addEventListener("click", async () => {
        if (!confirm("이 배너를 삭제할까요?")) return;
        const { error } = await K1D.sb().from("hc_banners").delete().eq("id", b.id);
        if (error) return K1D.toast(K1D.errMsg(error), "err");
        close(); loadBanners();
      });
    });
  }

  // ---------- 룰 기준 ----------
  function renderRules() {
    $("#rule-list").innerHTML = `<table class="tbl"><thead><tr><th class="num">순위</th><th>룰</th><th>조건</th><th>기준값</th><th>상태</th><th></th></tr></thead><tbody>
      ${rules.map(r => `<tr><td class="num">${K1D.int(r.priority)}</td><td><b>${K1D.esc(r.name)}</b><div class="help">${r.code}</div></td>
        <td>${K1D.esc(r.description || "")}</td><td><code>${K1D.esc(JSON.stringify(r.params))}</code></td>
        <td>${r.active ? "사용" : '<span class="emph-red">중지</span>'}</td><td><button class="btn sm" data-code="${r.code}">수정</button></td></tr>`).join("")}</tbody></table>`;
    $("#rule-list").querySelectorAll("[data-code]").forEach(b => b.addEventListener("click", () => editRule(rules.find(r => r.code === b.dataset.code))));
  }

  function editRule(r) {
    K1D.modal(`<h2>룰 수정 · ${K1D.esc(r.name)}</h2><p class="help">${K1D.esc(r.description || "")}</p>
      <label class="lbl">우선순위 (작을수록 먼저, 화면에는 상위 2건)</label><input type="number" class="input" id="r-pri" value="${r.priority}">
      <label class="lbl">기준값 (JSON)</label><textarea class="input" id="r-params">${K1D.esc(JSON.stringify(r.params, null, 1))}</textarea>
      <label class="row mt"><input type="checkbox" id="r-active" ${r.active ? "checked" : ""}> 사용</label>
      <div class="actions"><button class="btn" data-close>취소</button><button class="btn primary" id="r-save">저장</button></div>`, (md, close) => {
      md.querySelector("#r-save").addEventListener("click", async () => {
        let params;
        try { params = JSON.parse(md.querySelector("#r-params").value || "{}"); } catch (e) { return K1D.toast("기준값 JSON 형식 오류: " + e.message, "err"); }
        const rec = { priority: Number(md.querySelector("#r-pri").value) || r.priority, params, active: md.querySelector("#r-active").checked, updated_at: new Date().toISOString() };
        const { error } = await K1D.sb().from("hc_rules").update(rec).eq("code", r.code);
        if (error) return K1D.toast(K1D.errMsg(error), "err");
        Object.assign(r, rec); rules.sort((a, b) => a.priority - b.priority);
        close(); K1D.toast(K1D.t("common.saved")); renderRules();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
