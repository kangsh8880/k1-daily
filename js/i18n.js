/* K1 Daily - 다국어 구조 (1단계: 한국어만. 언어 추가 시 DICT 에 사전만 추가)
   - HTML: data-i18n="키" (본문 텍스트), data-i18n-ph="키" (placeholder)
   - JS:   K1D.t("키", {변수}) */
(function () {
  "use strict";
  const DICT = {
    ko: {
      "nav.today": "오늘", "nav.items": "항목", "nav.report": "리포트", "nav.settings": "설정",
      "app.name": "K1 Daily", "app.tagline": "나만의 시간대별 체크리스트",

      "login.title": "로그인", "login.desc": "이메일로 받은 인증 코드로 로그인합니다. 비밀번호는 필요 없습니다.",
      "login.email": "이메일", "login.send": "인증 코드 받기", "login.code": "메일로 받은 인증 코드",
      "login.verify": "로그인", "login.resend": "코드 다시 받기", "login.changeEmail": "이메일 바꾸기",
      "login.sent": "{email} 로 인증 메일을 보냈습니다. 메일의 숫자 코드를 입력하거나 메일의 링크를 누르세요.",
      "login.homeHint": "홈 화면에 추가해서 앱처럼 쓰면 알림을 받을 수 있습니다 (아이폰은 필수).",

      "today.title": "오늘 체크", "today.rate": "오늘 준수율", "today.done": "완료", "today.left": "남은 체크",
      "today.empty": "오늘 체크할 항목이 없습니다.", "today.missed": "미완료", "today.upcoming": "예정",
      "today.doneAt": "{time} 완료", "today.skip": "건너뜀", "today.readonly": "지난 날짜는 보기만 가능합니다",
      "today.onboardTitle": "처음 오셨네요! 추천 세트로 시작해 보세요",
      "today.onboardDesc": "불러온 뒤 항목·시간은 '항목' 화면에서 자유롭게 고칠 수 있습니다.",
      "today.apply": "선택한 세트 불러오기", "today.startDate": "시작일",
      "today.denomHelp": "준수율 = 완료 ÷ 시간이 지난 체크 (미리 완료한 체크 포함)",

      "items.title": "항목 관리", "items.add": "+ 항목 추가", "items.template": "추천 세트",
      "items.edit": "항목 수정", "items.new": "새 항목", "items.name": "이름", "items.category": "분류",
      "items.times": "알림 시간", "items.addTime": "+ 시간 추가", "items.days": "요일",
      "items.period": "기간 (선택)", "items.remind": "미완료 시 재알림", "items.note": "메모",
      "items.save": "저장", "items.cancel": "취소", "items.delete": "삭제", "items.pause": "일시중지", "items.resume": "다시 시작",
      "items.confirmDelete": "'{title}' 항목을 삭제할까요? 지난 체크 기록은 보존됩니다.",
      "items.ruleNote": "수정 내용은 다음 회차부터 적용되고, 지난 기록은 그대로 보존됩니다.",
      "items.empty": "등록된 항목이 없습니다.",

      "report.title": "준수율 리포트", "report.today": "오늘", "report.d7": "최근 7일", "report.d30": "최근 30일",
      "report.streak": "연속 달성", "report.trendKpi": "준수율", "report.byCat": "분류별 준수율 (최근 7일)",
      "report.byItem": "항목별 준수율 (최근 7일, 낮은 순)",

      "settings.title": "설정", "settings.profile": "내 정보", "settings.name": "표시 이름", "settings.tz": "시간대",
      "settings.save": "저장", "settings.push": "알림", "settings.pushOn": "이 기기에서 알림 켜기",
      "settings.pushTest": "테스트 알림 보내기", "settings.pushOff": "이 기기 알림 끄기",
      "settings.pushAll": "모든 기기 알림 받기", "settings.theme": "화면 테마", "settings.logout": "로그아웃",
      "settings.admin": "관리자 화면 (응원 메시지·배너·룰)", "settings.install": "홈 화면에 추가하는 방법",

      "common.saved": "저장했습니다", "common.error": "오류가 발생했습니다", "common.loading": "불러오는 중…",
      "common.offline": "네트워크 연결을 확인해 주세요"
    }
  };
  const lang = (self.K1D_CONFIG && self.K1D_CONFIG.lang) || "ko";
  window.K1D = window.K1D || {};
  K1D.t = function (key, vars) {
    let s = (DICT[lang] && DICT[lang][key]) || (DICT.ko[key]) || key;
    if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  };
  K1D.applyI18n = function (root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(el => { el.textContent = K1D.t(el.dataset.i18n); });
    (root || document).querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = K1D.t(el.dataset.i18nPh); });
  };
})();
