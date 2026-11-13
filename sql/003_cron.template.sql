-- ============================================================================
-- 루틴원 - 003 매분 알림 예약 작업 (pg_cron → Edge Function)
-- __CRON_SECRET__ 를 Edge Function Secret(CRON_SECRET)과 같은 값으로 바꿔 실행
-- (실제 값이 들어간 파일은 저장소에 올리지 않음)
-- ============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname in ('k1-daily-push', 'k1-daily-cleanup');

select cron.schedule('k1-daily-push', '* * * * *', $job$
  select net.http_post(
    url := 'https://ixzbqggtkdludremcsln.supabase.co/functions/v1/k1-daily-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', 'sb_publishable_DFZQO5i7OIWZYEExaO3B4A__-f_teEv',  -- 없으면 관문에서 401 UNAUTHORIZED_NO_AUTH_HEADER
      'x-cron-secret', '__CRON_SECRET__'),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 20000
  );
$job$);

-- 예약 작업 실행 이력 정리 (매일 03:17 UTC, 3일 보관)
select cron.schedule('k1-daily-cleanup', '17 3 * * *', $job$
  delete from cron.job_run_details
   where end_time < now() - interval '3 days'
     and jobid in (select jobid from cron.job where jobname like 'k1-daily%');
$job$);

select jobname, schedule, active from cron.job where jobname like 'k1-daily%';
