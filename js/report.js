/* K1 Daily - 준수율 리포트
   - KPI 타일: 필터 미적용 (오늘 / 최근 7일 / 최근 30일 / 연속 달성)
   - 추이 차트: 기간 필터(7·14·30일) 적용, 제목 = KPI명 + " 추이"
   - 모든 수치는 서버 단일 산식(hc_day_stats) 결과만 사용 */
(function () {
  "use strict";
  const K1D = window.K1D;
  const $ = s => document.querySelector(s);
  let chart = null, stats30 = [];

  async function init() {
    K1D.renderNav("report");
    const me = await K1D.requireLogin();
    if (!me) return;
    try {
      const [sm, st] = await Promise.all([K1D.rpc("hc_summary"),
        K1D.rpc("hc_stats", { p_from: K1D.addDays(me.today, -29), p_to: me.today })]);
      stats30 = st || [];
      renderKpis(sm);
      renderChart(7);
      document.querySelectorAll("#range button").forEach(b => b.addEventListener("click", () => {
        document.querySelectorAll("#range button").forEach(x => x.classList.toggle("on", x === b));
        renderChart(Number(b.dataset.n));
      }));
      const [cats, its] = await Promise.all([K1D.rpc("hc_category_stats", { p_days: 7 }), K1D.rpc("hc_item_stats", { p_days: 7 })]);
      renderTable($("#cat-table"), cats, "분류", r => K1D.esc(r.category));
      renderTable($("#item-table"), its, "항목", r => `${K1D.esc(r.title)} <span class="chip ${K1D.catClass(r.category)}">${K1D.esc(r.category)}</span>`);
    } catch (e) { K1D.toast(K1D.errMsg(e), "err"); }
    K1D.renderFeedback($("#feedback"));
    K1D.renderBanner($("#banner"));
  }

  function tile(id, o, sub) {
    const el = $(id);
    el.className = "kpi " + K1D.rateClass(o.rate);
    el.querySelector(".k-val").firstChild.textContent = K1D.pct(o.rate);
    el.querySelector(".k-sub").textContent = sub || `${K1D.int(o.done)} / ${K1D.int(o.total)}`;
  }

  function renderKpis(sm) {
    tile("#kt-today", sm.d1);
    tile("#kt-7", sm.d7);
    tile("#kt-30", sm.d30);
    $("#kt-streak .k-val").firstChild.textContent = K1D.int(sm.streak);
    $("#kt-streak .k-sub").textContent = `준수율 ${K1D.int(sm.streak_min)}% 이상`;
  }

  function renderChart(n) {
    const kpiName = K1D.t("report.trendKpi");
    $("#chart-title").textContent = kpiName + " 추이";
    const labels = [], vals = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = K1D.addDays(K1D.me.today, -i);
      const r = stats30.find(x => x.d === d);
      labels.push(d.slice(5).replace("-", "/"));
      vals.push(r && r.rate != null ? Number(r.rate) : null);
    }
    const css = getComputedStyle(document.documentElement);
    const grid = css.getPropertyValue("--border").trim(), txt = css.getPropertyValue("--mute").trim();
    if (chart) chart.destroy();
    chart = new Chart($("#chart"), {
      type: "line",
      data: { labels, datasets: [
        { label: kpiName + " (%)", data: vals, borderColor: "#7FA7D3", backgroundColor: "rgba(214,228,240,.55)", fill: true, tension: .25, spanGaps: true, pointRadius: 4, pointBackgroundColor: vals.map(v => v != null && v < 60 ? "#D99393" : "#7FA7D3") },
        { label: "목표 80%", data: labels.map(() => 80), borderColor: "#C9B27A", borderDash: [6, 4], pointRadius: 0, fill: false }
      ] },
      options: {
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100, ticks: { color: txt, callback: v => v + "%" }, grid: { color: grid } }, x: { ticks: { color: txt }, grid: { display: false } } },
        plugins: { legend: { labels: { color: txt, boxWidth: 14 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw == null ? "-" : Number(c.raw).toFixed(1) + "%"}` } } }
      }
    });
  }

  function renderTable(el, rows, head, nameFn) {
    if (!rows || !rows.length) { el.innerHTML = '<div class="empty">아직 데이터가 없습니다</div>'; return; }
    // 가장 큰 미달 1~2개만 강조 (80% 미만 중 낮은 순)
    const worst = rows.filter(r => r.rate != null && Number(r.rate) < 80).slice(0, 2).map(r => r);
    el.innerHTML = `<table class="tbl"><thead><tr><th>${head}</th><th class="num">완료</th><th class="num">대상</th><th class="num">준수율(%)</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${worst.includes(r) ? "worst" : ""}"><td>${nameFn(r)}</td><td class="num">${K1D.int(r.done)}</td><td class="num">${K1D.int(r.total)}</td><td class="num">${K1D.pct(r.rate)}</td></tr>`).join("")}
      </tbody></table>`;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
