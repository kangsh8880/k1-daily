/* K1 Daily - 환경 설정 (페이지와 서비스워커 공용) */
self.K1D_CONFIG = {
  version: "0.1.1",
  supabaseUrl: "https://ixzbqggtkdludremcsln.supabase.co",
  // 공개(publishable) 키: 브라우저 공개용. 데이터 보호는 RLS + 함수 권한으로 처리
  supabaseKey: "sb_publishable_DFZQO5i7OIWZYEExaO3B4A__-f_teEv",
  pushFunction: "k1-daily-push",
  vapidPublicKey: "BOg_aYj_gBXfTrr1LDwPmOhAiAEqi3LAZ8IW3TYn6hlS4O0tHEG2lNUXXFuzwRQn2PGOorlYp9OhRf1hyZFu1tg",
  defaultTz: "Asia/Ho_Chi_Minh",
  lang: "ko"
};
