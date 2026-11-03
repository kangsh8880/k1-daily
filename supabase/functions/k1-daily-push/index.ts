// ============================================================================
// K1 Daily - 웹푸시 발송 Edge Function  (함수 이름: k1-daily-push)
//  - mode "cron": pg_cron 이 매분 호출 → hc_due_push() 결과를 웹푸시로 발송
//  - mode "test": 로그인 사용자가 설정 화면에서 "테스트 알림" → 본인 기기로 1건 발송
// 필요 Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// 배포 시 "Verify JWT" 는 끔 (cron 은 x-cron-secret 으로, test 는 사용자 토큰으로 직접 검증)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:kangsh8880@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Target = { endpoint: string; p256dh: string; auth: string; payload: Record<string, unknown> };

async function sendAll(targets: Target[]) {
  let sent = 0, failed = 0;
  const gone: string[] = [];
  const ok: string[] = [];
  const errors: string[] = [];
  await Promise.all(targets.map(async (t) => {
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        JSON.stringify(t.payload),
        { TTL: 1800, urgency: "high" },
      );
      sent++; ok.push(t.endpoint);
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(t.endpoint);   // 만료된 구독 정리
      errors.push(`${code ?? "ERR"}: ${(e as Error).message?.slice(0, 120)}`);
    }
  }));
  if (gone.length) await admin.from("hc_push_subs").delete().in("endpoint", gone);
  if (ok.length) await admin.from("hc_push_subs").update({ last_ok_at: new Date().toISOString() }).in("endpoint", ok);
  return { sent, failed, removed: gone.length, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: { mode?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  // ---- 테스트 알림 (로그인 사용자 본인) ----
  if (body.mode === "test") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) return json({ error: "로그인이 필요합니다" }, 401);
    const { data: subs, error: e2 } = await admin.rpc("hc_push_test_targets", { p_user: data.user.id });
    if (e2) return json({ error: e2.message }, 500);
    if (!subs?.length) return json({ error: "등록된 알림 기기가 없습니다. 먼저 '알림 켜기'를 눌러 주세요." }, 400);
    const payload = { title: "K1 Daily 테스트 알림", body: "알림이 정상적으로 도착했습니다.", tokens: [], count: 0, tag: "k1d-test", url: "today.html" };
    const r = await sendAll(subs.map((s: Target) => ({ ...s, payload })));
    return json({ mode: "test", ...r });
  }

  // ---- 매분 정시 알림 (pg_cron) ----
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "forbidden" }, 403);
  const { data, error } = await admin.rpc("hc_due_push");
  if (error) return json({ error: error.message }, 500);
  if (!data?.length) return json({ mode: "cron", sent: 0 });
  const r = await sendAll(data as Target[]);
  return json({ mode: "cron", targets: data.length, ...r });
});
