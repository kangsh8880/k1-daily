-- ============================================================================
-- 루틴원 v0.2.0 마이그레이션 (2026-11-06)
--  ① 개인정보 동의 (hc_give_consent)   ② 회원 탈퇴 (hc_delete_account, 전체 데이터 삭제)
--  ③ 하루 마감 요약 푸시 (hc_due_push 확장, 기본 21:45)   ④ 서비스 상태 점검 (hc_health, 장애 감시용)
-- 재실행 가능. 001 → 002 → 003 → 007 순서
-- ============================================================================

-- ① ② ③ 프로필 컬럼
alter table public.hc_profiles add column if not exists consent_at        timestamptz;
alter table public.hc_profiles add column if not exists consent_version   text;
alter table public.hc_profiles add column if not exists summary_enabled   boolean not null default true;
alter table public.hc_profiles add column if not exists summary_time      time    not null default '21:45';
alter table public.hc_profiles add column if not exists summary_sent_on   date;

-- hc_me: 동의·요약 설정 포함
create or replace function public.hc_me()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p public.hc_profiles%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.hc_profiles(user_id, display_name)
  values (v_uid, split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1))
  on conflict (user_id) do nothing;
  select * into p from public.hc_profiles where user_id = v_uid;
  return jsonb_build_object(
    'user_id', v_uid, 'display_name', p.display_name, 'tz', p.tz, 'push_enabled', p.push_enabled,
    'email', auth.jwt() ->> 'email', 'is_admin', public.hc_is_admin(),
    'today', public.hc_local_today(v_uid),
    'item_count', (select count(*) from public.hc_items where user_id = v_uid and deleted_at is null),
    'consent_at', p.consent_at, 'consent_version', p.consent_version,
    'summary_enabled', p.summary_enabled, 'summary_time', to_char(p.summary_time, 'HH24:MI'));
end $$;

-- ① 동의 기록
create or replace function public.hc_give_consent(p_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.hc_profiles set consent_at = now(), consent_version = left(p_version, 20) where user_id = auth.uid();
end $$;

-- ② 회원 탈퇴: 계정과 모든 데이터 즉시 삭제 (hc_ 테이블은 on delete cascade)
create or replace function public.hc_delete_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from public.hc_push_subs where user_id = v_uid;
  delete from public.hc_occ       where user_id = v_uid;
  delete from public.hc_items     where user_id = v_uid;
  delete from public.hc_days      where user_id = v_uid;
  delete from public.hc_profiles  where user_id = v_uid;
  delete from auth.users          where id = v_uid;
end $$;

-- ③ 요약 알림 설정
create or replace function public.hc_update_summary(p_enabled boolean, p_time text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.hc_profiles
     set summary_enabled = coalesce(p_enabled, summary_enabled),
         summary_time = coalesce(nullif(p_time, '')::time, summary_time)
   where user_id = auth.uid();
end $$;

-- 피드백 룰 공통 함수 (화면·마감 요약 푸시가 같은 룰 사용)
create or replace function public.hc_feedback_core(p_user uuid)
returns table (rule_code text, rule_name text, message text, priority int)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := p_user;
  v_today date; v_name text;
  v_t record; v_y record;
  v_avg3 numeric; v_cnt3 int; v_streak int; v_rate7 numeric;
  v_item text; v_first boolean;
  v_vars jsonb;
  r record; v_msg text;
  v_hits jsonb := '[]'::jsonb;
  p jsonb;
begin
  if v_uid is null then return; end if;
  v_today := public.hc_local_today(v_uid);
  perform public.hc_ensure_day(v_uid, v_today);
  select coalesce(display_name, '회원') into v_name from public.hc_profiles where user_id = v_uid;

  select * into v_t from public.hc_day_stats(v_uid, v_today, v_today);
  select * into v_y from public.hc_day_stats(v_uid, v_today - 1, v_today - 1);
  select avg(rate), count(rate) into v_avg3, v_cnt3 from public.hc_day_stats(v_uid, v_today - 3, v_today - 1);
  select round(100.0 * sum(done) / nullif(sum(total), 0), 1) into v_rate7
    from public.hc_day_stats(v_uid, v_today - 6, v_today);
  v_first := not exists (select 1 from public.hc_occ where user_id = v_uid and occ_date < v_today);

  v_vars := jsonb_build_object('이름', v_name,
                               '준수율', coalesce(to_char(v_t.rate, 'FM990.0'), '-'),
                               '7일준수율', coalesce(to_char(v_rate7, 'FM990.0'), '-'));

  for r in select * from public.hc_rules where active order by priority loop
    p := r.params;
    v_msg := null;

    if r.code = 'START' and v_first then
      v_msg := public.hc_pick_message(r.code, v_vars);

    elsif r.code = 'PERFECT_TODAY' and coalesce(v_t.total, 0) >= coalesce((p->>'min_due')::int, 3)
          and v_t.done >= v_t.total then
      v_msg := public.hc_pick_message(r.code, v_vars);

    elsif r.code = 'PERIOD_DONE' then
      select i.title into v_item
        from public.hc_items i
        join public.hc_occ o on o.item_id = i.id
       where i.user_id = v_uid and i.end_date between v_today - 1 and v_today and i.deleted_at is null
       group by i.id, i.title
      having 100.0 * count(*) filter (where o.status = 'done')
             / nullif(count(*) filter (where o.slot_at <= now() or o.status <> 'pending'), 0)
             >= coalesce((p->>'min_rate')::numeric, 80)
       limit 1;
      if v_item is not null then
        v_msg := public.hc_pick_message(r.code, v_vars || jsonb_build_object('항목', v_item));
      end if;

    elsif r.code = 'STREAK' then
      v_streak := public.hc_streak(v_uid, coalesce((p->>'min_rate')::numeric, 80));
      if v_streak >= coalesce((p->>'min_days')::int, 3) then
        v_msg := public.hc_pick_message(r.code, v_vars || jsonb_build_object('연속일수', v_streak));
      end if;

    elsif r.code = 'RECOVERY' and v_y.rate is not null and v_t.rate is not null
          and v_y.rate < coalesce((p->>'prev_below')::numeric, 50)
          and v_t.rate >= coalesce((p->>'now_above')::numeric, 80)
          and v_t.total >= coalesce((p->>'min_due')::int, 3) then
      v_msg := public.hc_pick_message(r.code, v_vars);

    elsif r.code = 'DROP' and v_cnt3 >= 2 and v_avg3 < coalesce((p->>'below')::numeric, 60) then
      v_msg := public.hc_pick_message(r.code, v_vars || jsonb_build_object('3일평균', to_char(v_avg3, 'FM990.0')));

    elsif r.code = 'MISS_ITEM' then
      select i.title into v_item
        from public.hc_items i
       where i.user_id = v_uid and i.deleted_at is null and i.active
         and (select count(*) from (
                select o.occ_date from public.hc_occ o
                 where o.item_id = i.id and o.occ_date between v_today - coalesce((p->>'days')::int, 3) and v_today - 1
                 group by o.occ_date
                having count(*) filter (where o.status = 'done') = 0) x) >= coalesce((p->>'days')::int, 3)
       order by i.sort limit 1;
      if v_item is not null then
        v_msg := public.hc_pick_message(r.code, v_vars || jsonb_build_object('항목', v_item));
      end if;

    elsif r.code = 'DEFAULT' and jsonb_array_length(v_hits) = 0 then
      v_msg := public.hc_pick_message(r.code, v_vars);
    end if;

    if v_msg is not null then
      v_hits := v_hits || jsonb_build_array(jsonb_build_object('c', r.code, 'n', r.name, 'm', v_msg, 'p', r.priority));
    end if;
    exit when jsonb_array_length(v_hits) >= 2;
  end loop;

  return query
    select h->>'c', h->>'n', h->>'m', (h->>'p')::int from jsonb_array_elements(v_hits) h;
end $$;

create or replace function public.hc_feedback()
returns table (rule_code text, rule_name text, message text, priority int)
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query select * from public.hc_feedback_core(auth.uid());
end $$;

-- ③ 발송 대상: 회차 알림 + 하루 마감 요약
create or replace function public.hc_due_push()
returns table (user_id uuid, endpoint text, p256dh text, auth text, payload jsonb)
language plpgsql security definer set search_path = public as $$
declare u record; s record; v_msg text; v_body text; v_left int;
begin
  for u in select distinct i.user_id from public.hc_items i where i.deleted_at is null and i.active loop
    perform public.hc_ensure_day(u.user_id, public.hc_local_today(u.user_id));
  end loop;

  update public.hc_occ set next_notify_at = null
   where status = 'pending' and next_notify_at < now() - interval '3 hours';

  -- (a) 회차 알림
  return query
  with due as (
    select o.id from public.hc_occ o
    join public.hc_profiles p on p.user_id = o.user_id and p.push_enabled
    where o.status = 'pending' and o.next_notify_at <= now()
    for update of o skip locked
  ), upd as (
    update public.hc_occ o
       set notify_count = o.notify_count + 1,
           next_notify_at = case when o.notify_count = 0 and i.remind_min > 0
                                 then now() + make_interval(mins => i.remind_min) end
      from due, public.hc_items i
     where o.id = due.id and i.id = o.item_id
    returning o.user_id, o.title, o.slot_time, o.token, o.notify_count
  ), grp as (
    select upd.user_id,
           jsonb_build_object(
             'title', case when count(*) = 1
                           then case when max(upd.notify_count) > 1 then '다시 알림 · ' else '' end
                                || to_char(min(upd.slot_time), 'HH24:MI') || ' ' || max(upd.title)
                           else case when max(upd.notify_count) > 1 then '다시 알림 · ' else '' end
                                || to_char(min(upd.slot_time), 'HH24:MI') || ' 체크 ' || count(*) || '건' end,
             'body', string_agg(upd.title, ' / ' order by upd.slot_time, upd.title),
             'tokens', jsonb_agg(upd.token),
             'count', count(*),
             'tag', 'k1d-' || to_char(min(upd.slot_time), 'HH24MI'),
             'url', 'today.html') as payload
    from upd group by upd.user_id
  )
  select g.user_id, sb.endpoint, sb.p256dh, sb.auth, g.payload
  from grp g join public.hc_push_subs sb on sb.user_id = g.user_id;

  -- (b) 하루 마감 요약 (사용자 현지 시각이 요약 시각을 지났고 오늘 아직 안 보낸 경우, 1회)
  for s in
    select p.user_id, public.hc_local_today(p.user_id) as d
      from public.hc_profiles p
     where p.push_enabled and p.summary_enabled
       and (now() at time zone p.tz)::time >= p.summary_time
       and (now() at time zone p.tz)::time <  p.summary_time + interval '2 hours'
       and (p.summary_sent_on is null or p.summary_sent_on < (now() at time zone p.tz)::date)
       and exists (select 1 from public.hc_push_subs x where x.user_id = p.user_id)
       and exists (select 1 from public.hc_occ o where o.user_id = p.user_id and o.occ_date = (now() at time zone p.tz)::date)
     for update of p skip locked
  loop
    update public.hc_profiles set summary_sent_on = s.d where hc_profiles.user_id = s.user_id;
    select f.message into v_msg from public.hc_feedback_core(s.user_id) f order by f.priority limit 1;
    select count(*) into v_left from public.hc_occ o
     where o.user_id = s.user_id and o.occ_date = s.d and o.status = 'pending' and o.slot_at > now();
    select '완료 ' || coalesce(st.done, 0) || '/' || coalesce(st.total, 0)
           || ' (' || coalesce(to_char(st.rate, 'FM990.0'), '-') || '%)'
           || case when v_left > 0 then ' · 남은 체크 ' || v_left || '건' else '' end
      into v_body from public.hc_day_stats(s.user_id, s.d, s.d) st;
    v_body := coalesce(v_body, '완료 0/0') || coalesce(E'\n' || v_msg, '');
    return query
      select s.user_id, sb.endpoint, sb.p256dh, sb.auth,
             jsonb_build_object('title', '오늘 마감 요약', 'body', v_body, 'tokens', '[]'::jsonb,
                                'count', 0, 'tag', 'k1d-summary', 'url', 'report.html')
        from public.hc_push_subs sb where sb.user_id = s.user_id;
  end loop;
end $$;

-- ④ 서비스 상태 점검 (개인정보 없음, 외부 감시용 공개 RPC)
--   ok = 최근 10분 안에 정상(200) 예약 호출이 있고, 최근 1시간 푸시가 '전부 실패'하지 않음
create or replace function public.hc_health()
returns jsonb language plpgsql stable security definer set search_path = public, net as $$
declare v_last_ok timestamptz; v_fail15 int; v_sent int; v_failed int; v_job boolean;
begin
  select max(created) into v_last_ok from net._http_response
   where status_code = 200 and content like '%"mode":"cron"%';
  select count(*) into v_fail15 from net._http_response
   where created > now() - interval '15 minutes' and (status_code is null or status_code <> 200);
  select coalesce(sum((content::jsonb ->> 'sent')::int), 0), coalesce(sum((content::jsonb ->> 'failed')::int), 0)
    into v_sent, v_failed
    from net._http_response
   where created > now() - interval '1 hour' and status_code = 200 and content like '%"mode":"cron"%';
  select coalesce(bool_and(active), false) into v_job from cron.job where jobname = 'k1-daily-push';
  return jsonb_build_object(
    'ok', v_job and v_last_ok is not null and v_last_ok > now() - interval '10 minutes'
          and not (v_failed > 0 and v_sent = 0),
    'cron_active', v_job,
    'last_ok_at', v_last_ok,
    'minutes_since_ok', round(extract(epoch from now() - v_last_ok) / 60.0, 1),
    'http_fail_15m', v_fail15,
    'push_sent_1h', v_sent, 'push_failed_1h', v_failed,
    'checked_at', now());
end $$;

-- 권한
revoke all on function public.hc_feedback_core(uuid) from public, anon, authenticated;
revoke all on function public.hc_give_consent(text), public.hc_delete_account(), public.hc_update_summary(boolean, text),
               public.hc_health(), public.hc_me(), public.hc_feedback(), public.hc_due_push() from public, anon;
grant execute on function public.hc_me()                        to authenticated;
grant execute on function public.hc_feedback()                  to authenticated;
grant execute on function public.hc_give_consent(text)          to authenticated;
grant execute on function public.hc_delete_account()            to authenticated;
grant execute on function public.hc_update_summary(boolean, text) to authenticated;
grant execute on function public.hc_health()                    to anon, authenticated;
revoke all on function public.hc_due_push() from authenticated;
grant execute on function public.hc_due_push()                  to service_role;

select public.hc_health() as 상태점검;
