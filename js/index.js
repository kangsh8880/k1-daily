/* 루틴원 - 로그인 (이메일 인증 코드 / 메일 링크, 비밀번호 없음) */
(function () {
  "use strict";
  const K1D = window.K1D;
  const $ = s => document.querySelector(s);
  let email = "";

  async function init() {
    const sb = K1D.sb();
    // 메일 링크로 들어온 경우 detectSessionInUrl 이 세션을 저장 → 바로 이동
    const { data } = await sb.auth.getSession();
    if (data.session) { location.replace("today.html"); return; }
    sb.auth.onAuthStateChange((ev, session) => { if (session) location.replace("today.html"); });

    try { email = localStorage.getItem("k1d-last-email") || ""; } catch (e) { /* 무시 */ }
    $("#email").value = email;
    $("#form-email").addEventListener("submit", sendCode);
    $("#form-code").addEventListener("submit", verify);
    $("#btn-resend").addEventListener("click", sendCode);
    $("#btn-change").addEventListener("click", () => { $("#step-code").classList.add("hidden"); $("#step-email").classList.remove("hidden"); });
  }

  async function sendCode(ev) {
    if (ev) ev.preventDefault();
    email = $("#email").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { K1D.toast("이메일 형식을 확인해 주세요", "err"); return; }
    const btn = $("#btn-send"); btn.disabled = true;
    try {
      const redirect = new URL("today.html", location.href).href;
      const { error } = await K1D.sb().auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
      if (error) throw error;
      try { localStorage.setItem("k1d-last-email", email); } catch (e) { /* 무시 */ }
      $("#sent-msg").textContent = K1D.t("login.sent", { email });
      $("#step-email").classList.add("hidden");
      $("#step-code").classList.remove("hidden");
      $("#code").focus();
    } catch (e) {
      const m = K1D.errMsg(e);
      K1D.toast(/rate|seconds/i.test(m) ? "잠시 후 다시 시도해 주세요 (메일 발송 횟수 제한): " + m : m, "err");
    } finally { btn.disabled = false; }
  }

  async function verify(ev) {
    ev.preventDefault();
    const token = $("#code").value.replace(/\D/g, "");
    if (token.length < 6) { K1D.toast("메일로 받은 숫자 코드를 입력해 주세요", "err"); return; }
    const btn = $("#btn-verify"); btn.disabled = true;
    try {
      const { error } = await K1D.sb().auth.verifyOtp({ email, token, type: "email" });
      if (error) throw error;
      location.replace("today.html");
    } catch (e) {
      K1D.toast("코드가 맞지 않거나 만료되었습니다. " + K1D.errMsg(e), "err");
    } finally { btn.disabled = false; }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
