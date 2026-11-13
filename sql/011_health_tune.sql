-- ============================================================================
-- 루틴원 (2026-11-13): 상태 점검 오경보 줄이기
--  · 만료되어 자동 정리된 알림 구독(404/410, removed)은 '실패'로 세지 않음
--    (앱 재설치·알림 재허용 시 예전 구독이 만료되는 것은 정상)
-- ============================================================================

-- ① 점검 기준 보완
create or replace function public.hc_health()
returns jsonb language plpgsql stable security definer set search_path = public, net as $$
declare v_last_ok timestamptz; v_fail15 int; v_sent int; v_failed int; v_removed int; v_job boolean;
begin
  select max(created) into v_last_ok from net._http_response
   where status_code = 200 and content like '%"mode":"cron"%';
  select count(*) into v_fail15 from net._http_response
   where created > now() - interval '15 minutes' and (status_code is null or status_code <> 200);
  select coalesce(sum((content::jsonb ->> 'sent')::int), 0),
         coalesce(sum((content::jsonb ->> 'failed')::int), 0),
         coalesce(sum(coalesce((content::jsonb ->> 'removed')::int, 0)), 0)
    into v_sent, v_failed, v_removed
    from net._http_response
   where created > now() - interval '1 hour' and status_code = 200 and content like '%"mode":"cron"%';
  select coalesce(bool_and(active), false) into v_job from cron.job where jobname = 'k1-daily-push';
  return jsonb_build_object(
    'ok', v_job and v_last_ok is not null and v_last_ok > now() - interval '10 minutes'
          and not ((v_failed - v_removed) > 0 and v_sent = 0),
    'cron_active', v_job,
    'last_ok_at', v_last_ok,
    'minutes_since_ok', round(extract(epoch from now() - v_last_ok) / 60.0, 1),
    'http_fail_15m', v_fail15,
    'push_sent_1h', v_sent, 'push_failed_1h', v_failed - v_removed, 'push_expired_1h', v_removed,
    'checked_at', now());
end $$;
grant execute on function public.hc_health() to anon, authenticated;

-- ② 원인 확인 (편집기에는 마지막 결과만 보이므로 맨 끝에 둠): 최근 6시간 동안 발송 실패가 있었던 호출
select created at time zone 'Asia/Ho_Chi_Minh' as 베트남시각,
       content::jsonb ->> 'sent'    as 성공,
       content::jsonb ->> 'failed'  as 실패,
       content::jsonb ->> 'removed' as 만료정리,
       content::jsonb ->  'errors'  as 오류내용
  from net._http_response
 where status_code = 200 and content like '%"mode":"cron"%'
   and coalesce((content::jsonb ->> 'failed')::int, 0) > 0
 order by created desc
 limit 10;

