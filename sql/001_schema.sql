-- ============================================================================
-- K1 Daily (개인 체크리스트 실행력 서비스) - 001 스키마
-- Supabase 프로젝트 공유 사용: 모든 객체는 hc_ 접두어로 분리 (기존 테이블 영향 없음)
-- 실행: Supabase SQL Editor 에서 001 → 002 → 003 순서로 1회 실행 (재실행 가능)
-- ============================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------------
create table if not exists public.hc_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  tz           text not null default 'Asia/Ho_Chi_Minh',
  push_enabled boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.hc_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  category    text not null default '생활' check (char_length(category) between 1 and 20),
  note        text check (note is null or char_length(note) <= 200),
  times       time[] not null check (cardinality(times) between 1 and 12),
  days        smallint[] not null default '{1,2,3,4,5,6,7}',   -- ISO 요일 1=월 ~ 7=일
  start_date  date,
  end_date    date,
  remind_min  int not null default 30 check (remind_min between 0 and 240),  -- 0 = 재알림 없음
  sort        int not null default 0,
  active      boolean not null default true,     -- false = 일시중지
  deleted_at  timestamptz,                       -- 삭제(숨김). 과거 기록은 보존
  template_code text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint hc_items_period_chk check (start_date is null or end_date is null or start_date <= end_date)
);
create index if not exists hc_items_user_idx on public.hc_items(user_id) where deleted_at is null;

-- 회차(occurrence): 날짜별로 확정 생성되는 체크 대상. 과거 회차는 항목 수정·삭제와 무관하게 보존
create table if not exists public.hc_occ (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  item_id        uuid not null references public.hc_items(id) on delete cascade,
  occ_date       date not null,
  slot_time      time not null,
  slot_at        timestamptz not null,
  title          text not null,
  category       text not null,
  status         text not null default 'pending' check (status in ('pending','done','skip')),
  done_at        timestamptz,
  via            text,
  token          uuid not null default gen_random_uuid(),
  notify_count   int not null default 0,
  next_notify_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (item_id, occ_date, slot_time)
);
create index if not exists hc_occ_user_date_idx on public.hc_occ(user_id, occ_date);
create unique index if not exists hc_occ_token_idx on public.hc_occ(token);
create index if not exists hc_occ_notify_idx on public.hc_occ(next_notify_at) where status = 'pending' and next_notify_at is not null;

-- 날짜별 회차 생성 완료 표시
create table if not exists public.hc_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  d       date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, d)
);

create table if not exists public.hc_push_subs (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists hc_push_subs_user_idx on public.hc_push_subs(user_id);

-- 중앙 관리(사람 없음, 비정기 변경): 룰 / 응원 메시지 / 하단 배너 / 템플릿 / 관리자
create table if not exists public.hc_rules (
  code        text primary key,
  name        text not null,
  description text,
  priority    int not null default 50,     -- 작을수록 우선
  params      jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.hc_messages (
  id         bigserial primary key,
  rule_code  text not null references public.hc_rules(code) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  active     boolean not null default true,
  valid_from date,
  valid_to   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hc_messages_rule_idx on public.hc_messages(rule_code) where active;

create table if not exists public.hc_banners (
  id         bigserial primary key,
  kind       text not null default 'notice' check (kind in ('notice','promo','ad')),
  body       text not null check (char_length(body) between 1 and 200),
  link_url   text,
  link_label text,
  weight     int not null default 1 check (weight between 1 and 100),
  active     boolean not null default true,
  valid_from date,
  valid_to   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hc_templates (
  code        text primary key,
  name        text not null,
  description text,
  period_days int,              -- 기간형 세트(예: 14일). null = 상시
  items       jsonb not null,   -- [{title,category,times[],days[],note,remind_min}]
  sort        int not null default 0,
  active      boolean not null default true
);

create table if not exists public.hc_admin_emails (
  email text primary key
);

-- ---------------------------------------------------------------------------
-- 2. 내부 함수 (클라이언트 직접 호출 불가)
-- ---------------------------------------------------------------------------
create or replace function public.hc_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hc_admin_emails
                 where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.hc_user_tz(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select tz from public.hc_profiles where user_id = p_user), 'Asia/Ho_Chi_Minh');
$$;

create or replace function public.hc_local_today(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone public.hc_user_tz(p_user))::date;
$$;

-- 하루치 회차 생성 (멱등). 항목 등록 시각 이전의 회차는 만들지 않음(등록 당일 아침 회차 미준수 방지)
create or replace function public.hc_ensure_day(p_user uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare v_tz text := public.hc_user_tz(p_user);
begin
  if exists (select 1 from public.hc_days where user_id = p_user and d = p_date) then
    return;
  end if;

  insert into public.hc_occ (user_id, item_id, occ_date, slot_time, slot_at, title, category, next_notify_at)
  select i.user_id, i.id, p_date, t.slot,
         (p_date + t.slot) at time zone v_tz,
         i.title, i.category,
         case when (p_date + t.slot) at time zone v_tz > now() - interval '10 minutes'
              then (p_date + t.slot) at time zone v_tz end
  from public.hc_items i
  cross join lateral unnest(i.times) as t(slot)
  where i.user_id = p_user
    and i.deleted_at is null and i.active
    and extract(isodow from p_date)::smallint = any(i.days)
    and (i.start_date is null or i.start_date <= p_date)
    and (i.end_date   is null or i.end_date   >= p_date)
    and (p_date + t.slot) at time zone v_tz >= i.created_at - interval '1 minute'
  on conflict (item_id, occ_date, slot_time) do nothing;

  insert into public.hc_days(user_id, d) values (p_user, p_date) on conflict do nothing;
end $$;

-- 항목 변경 시 "다음 회차부터" 반영: 오늘 아직 지나지 않은 미완료 회차만 다시 생성
create or replace function public.hc_refresh_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.hc_items%rowtype;
  v_tz text; v_today date;
begin
  select * into i from public.hc_items where id = p_item;
  if not found then return; end if;
  v_tz := public.hc_user_tz(i.user_id);
  v_today := (now() at time zone v_tz)::date;

  delete from public.hc_occ
   where item_id = p_item and status = 'pending'
     and (occ_date > v_today or (occ_date = v_today and slot_at > now()));

  if not exists (select 1 from public.hc_days where user_id = i.user_id and d = v_today) then
    return;   -- 오늘 회차가 아직 생성 전이면 hc_ensure_day 가 처리
  end if;

  if i.deleted_at is null and i.active
     and extract(isodow from v_today)::smallint = any(i.days)
     and (i.start_date is null or i.start_date <= v_today)
     and (i.end_date   is null or i.end_date   >= v_today) then
    insert into public.hc_occ (user_id, item_id, occ_date, slot_time, slot_at, title, category, next_notify_at)
    select i.user_id, i.id, v_today, t.slot, (v_today + t.slot) at time zone v_tz, i.title, i.category,
           (v_today + t.slot) at time zone v_tz
    from unnest(i.times) as t(slot)
    where (v_today + t.slot) at time zone v_tz > now()
    on conflict (item_id, occ_date, slot_time) do nothing;
  end if;
end $$;

create or replace function public.hc_items_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.hc_refresh_item(new.id);
  return new;
end $$;

drop trigger if exists hc_items_after_change_trg on public.hc_items;
create trigger hc_items_after_change_trg
after insert or update of title, category, times, days, start_date, end_date, active, deleted_at
on public.hc_items for each row execute function public.hc_items_after_change();

create or replace function public.hc_touch_updated()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists hc_items_touch on public.hc_items;
create trigger hc_items_touch before update on public.hc_items for each row execute function public.hc_touch_updated();
drop trigger if exists hc_profiles_touch on public.hc_profiles;
create trigger hc_profiles_touch before update on public.hc_profiles for each row execute function public.hc_touch_updated();

-- 일자별 준수율 (단일 계산 기준: 모든 화면·룰이 이 함수만 사용)
--   오늘: 분모 = 시간이 지난 회차 + 미리 완료한 회차 / 과거: 분모 = 전체 회차
--   준수율 = 완료 / 분모 × 100 (skip 은 미준수)
create or replace function public.hc_day_stats(p_user uuid, p_from date, p_to date)
returns table (d date, total int, done int, rate numeric)
language sql stable security definer set search_path = public as $$
  select o.occ_date,
         count(*) filter (where o.slot_at <= now() or o.status <> 'pending')::int,
         count(*) filter (where o.status = 'done')::int,
         case when count(*) filter (where o.slot_at <= now() or o.status <> 'pending') = 0 then null
              else round(100.0 * count(*) filter (where o.status = 'done')
                         / count(*) filter (where o.slot_at <= now() or o.status <> 'pending'), 1) end
  from public.hc_occ o
  where o.user_id = p_user and o.occ_date between p_from and p_to
  group by o.occ_date
  order by o.occ_date;
$$;

-- ---------------------------------------------------------------------------
-- 3. 클라이언트 RPC (로그인 사용자 본인 데이터만)
-- ---------------------------------------------------------------------------
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
    'item_count', (select count(*) from public.hc_items where user_id = v_uid and deleted_at is null));
end $$;

create or replace function public.hc_update_profile(p_name text, p_tz text, p_push boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_tz is not null and not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'invalid timezone: %', p_tz;
  end if;
  update public.hc_profiles
     set display_name = coalesce(nullif(trim(p_name), ''), display_name),
         tz = coalesce(p_tz, tz),
         push_enabled = coalesce(p_push, push_enabled)
   where user_id = auth.uid();
end $$;

-- 특정 날짜 체크 목록 (기본: 오늘). 오늘이면 회차를 먼저 생성
create or replace function public.hc_day(p_date date default null)
returns table (id uuid, item_id uuid, slot_time time, slot_at timestamptz, title text, category text,
               status text, done_at timestamptz, via text, note text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date; v_d date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := public.hc_local_today(v_uid);
  v_d := coalesce(p_date, v_today);
  if v_d = v_today then perform public.hc_ensure_day(v_uid, v_today); end if;
  return query
    select o.id, o.item_id, o.slot_time, o.slot_at, o.title, o.category, o.status, o.done_at, o.via, i.note
    from public.hc_occ o join public.hc_items i on i.id = o.item_id
    where o.user_id = v_uid and o.occ_date = v_d
    order by o.slot_time, i.sort, o.title;
end $$;

-- 체크/해제/건너뜀 (오늘과 어제만 변경 가능)
create or replace function public.hc_set_status(p_occ uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_status not in ('pending','done','skip') then raise exception 'invalid status'; end if;
  v_today := public.hc_local_today(v_uid);
  update public.hc_occ
     set status = p_status,
         done_at = case when p_status = 'pending' then null else now() end,
         via = case when p_status = 'pending' then null else 'web' end,
         next_notify_at = case when p_status = 'pending' then next_notify_at else null end
   where id = p_occ and user_id = v_uid and occ_date >= v_today - 1;
  if not found then raise exception '변경할 수 없는 회차입니다 (오늘·어제만 변경 가능)'; end if;
end $$;

-- 일자별 준수율 (본인)
create or replace function public.hc_stats(p_from date, p_to date)
returns table (d date, total int, done int, rate numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query select * from public.hc_day_stats(auth.uid(), p_from, p_to);
end $$;

-- 항목별 / 분류별 준수율 (최근 N일, 오늘 포함)
create or replace function public.hc_item_stats(p_days int default 7)
returns table (item_id uuid, title text, category text, total int, done int, rate numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := public.hc_local_today(v_uid);
  return query
    select o.item_id, max(i.title), max(i.category),
           count(*) filter (where o.slot_at <= now() or o.status <> 'pending')::int,
           count(*) filter (where o.status = 'done')::int,
           case when count(*) filter (where o.slot_at <= now() or o.status <> 'pending') = 0 then null
                else round(100.0 * count(*) filter (where o.status = 'done')
                           / count(*) filter (where o.slot_at <= now() or o.status <> 'pending'), 1) end
    from public.hc_occ o join public.hc_items i on i.id = o.item_id
    where o.user_id = v_uid and o.occ_date between v_today - (p_days - 1) and v_today
    group by o.item_id
    order by 6 asc nulls last, 2;
end $$;

create or replace function public.hc_category_stats(p_days int default 7)
returns table (category text, total int, done int, rate numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := public.hc_local_today(v_uid);
  return query
    select o.category,
           count(*) filter (where o.slot_at <= now() or o.status <> 'pending')::int,
           count(*) filter (where o.status = 'done')::int,
           case when count(*) filter (where o.slot_at <= now() or o.status <> 'pending') = 0 then null
                else round(100.0 * count(*) filter (where o.status = 'done')
                           / count(*) filter (where o.slot_at <= now() or o.status <> 'pending'), 1) end
    from public.hc_occ o
    where o.user_id = v_uid and o.occ_date between v_today - (p_days - 1) and v_today
    group by o.category
    order by 4 asc nulls last;
end $$;

-- 연속 달성일수 (어제부터 거꾸로, 준수율 >= 기준)
create or replace function public.hc_streak(p_user uuid, p_min numeric)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.hc_local_today(p_user); v_n int := 0; r record;
begin
  for r in select * from public.hc_day_stats(p_user, v_today - 120, v_today - 1) order by d desc loop
    if r.rate is null then continue; end if;
    if r.d <> v_today - 1 - v_n then exit; end if;  -- 날짜가 끊기면 중단
    exit when r.rate < p_min;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 리포트 KPI 요약 (단일 산식: hc_day_stats / hc_streak)
create or replace function public.hc_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date; v_min numeric; j jsonb := '{}'::jsonb; n int; r record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := public.hc_local_today(v_uid);
  foreach n in array array[1, 7, 30] loop
    select coalesce(sum(total), 0)::int t, coalesce(sum(done), 0)::int d,
           round(100.0 * sum(done) / nullif(sum(total), 0), 1) rt
      into r from public.hc_day_stats(v_uid, v_today - (n - 1), v_today);
    j := j || jsonb_build_object('d' || n, jsonb_build_object('total', r.t, 'done', r.d, 'rate', r.rt));
  end loop;
  select coalesce((params->>'min_rate')::numeric, 80) into v_min from public.hc_rules where code = 'STREAK';
  return j || jsonb_build_object('streak', public.hc_streak(v_uid, coalesce(v_min, 80)), 'streak_min', coalesce(v_min, 80));
end $$;

-- 메시지 1건 선택 (활성 + 유효기간) 후 변수 치환
create or replace function public.hc_pick_message(p_rule text, p_vars jsonb)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_body text; k text;
begin
  select body into v_body from public.hc_messages
   where rule_code = p_rule and active
     and (valid_from is null or valid_from <= current_date)
     and (valid_to is null or valid_to >= current_date)
   order by random() limit 1;
  if v_body is null then return null; end if;
  for k in select jsonb_object_keys(p_vars) loop
    v_body := replace(v_body, '{' || k || '}', coalesce(p_vars ->> k, ''));
  end loop;
  return v_body;
end $$;

-- 룰 기반 피드백 (중앙에 사람 없음). 상위 2건 반환
create or replace function public.hc_feedback()
returns table (rule_code text, rule_name text, message text, priority int)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date; v_name text;
  v_t record; v_y record;
  v_avg3 numeric; v_cnt3 int; v_streak int; v_rate7 numeric;
  v_item text; v_first boolean;
  v_vars jsonb;
  r record; v_msg text;
  v_hits jsonb := '[]'::jsonb;
  p jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
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

-- 하단 배너 1건 (가중치 랜덤)
create or replace function public.hc_banner()
returns table (id bigint, kind text, body text, link_url text, link_label text)
language sql volatile security definer set search_path = public as $$
  select b.id, b.kind, b.body, b.link_url, b.link_label
  from public.hc_banners b
  where b.active and (b.valid_from is null or b.valid_from <= current_date)
    and (b.valid_to is null or b.valid_to >= current_date)
  order by -ln(random()) / b.weight
  limit 1;
$$;

-- 템플릿 적용: p_start = 기간형 세트 시작일
create or replace function public.hc_apply_template(p_code text, p_start date default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t public.hc_templates%rowtype; v_n int; v_start date; v_end date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into t from public.hc_templates where code = p_code and active;
  if not found then raise exception '템플릿이 없습니다: %', p_code; end if;
  if t.period_days is not null then
    v_start := coalesce(p_start, public.hc_local_today(v_uid));
    v_end := v_start + t.period_days - 1;
  end if;
  insert into public.hc_items (user_id, title, category, note, times, days, start_date, end_date, remind_min, sort, template_code)
  select v_uid, x->>'title', coalesce(x->>'category', '생활'), x->>'note',
         array(select jsonb_array_elements_text(x->'times')::time),
         case when jsonb_typeof(x->'days') = 'array' and jsonb_array_length(x->'days') > 0
              then array(select jsonb_array_elements_text(x->'days')::smallint)
              else '{1,2,3,4,5,6,7}'::smallint[] end,
         v_start, v_end, coalesce((x->>'remind_min')::int, 30),
         coalesce((select max(sort) from public.hc_items where user_id = v_uid), 0) + ord::int,
         t.code
  from jsonb_array_elements(t.items) with ordinality as e(x, ord);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 푸시 구독 저장 (같은 endpoint 재구독 시 소유자 갱신)
create or replace function public.hc_save_push(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.hc_push_subs(endpoint, user_id, p256dh, auth, ua)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_ua, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
                                       auth = excluded.auth, ua = excluded.ua, created_at = now();
end $$;

create or replace function public.hc_delete_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.hc_push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 4. 알림 액션 (로그인 없이 토큰으로: 서비스워커·메일 링크)
-- ---------------------------------------------------------------------------
create or replace function public.hc_done_by_tokens(p_tokens uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.hc_occ set status = 'done', done_at = now(), via = 'push', next_notify_at = null
   where token = any(p_tokens) and status = 'pending' and occ_date >= current_date - 2;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.hc_snooze_by_tokens(p_tokens uuid[], p_min int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.hc_occ set next_notify_at = now() + make_interval(mins => least(greatest(p_min, 5), 120))
   where token = any(p_tokens) and status = 'pending' and occ_date >= current_date - 1 and notify_count < 4;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. 발송 대상 추출 (Edge Function 이 매분 호출, service_role 전용)
-- ---------------------------------------------------------------------------
create or replace function public.hc_due_push()
returns table (user_id uuid, endpoint text, p256dh text, auth text, payload jsonb)
language plpgsql security definer set search_path = public as $$
declare u record;
begin
  -- (1) 항목이 있는 사용자의 오늘 회차 생성
  for u in select distinct i.user_id from public.hc_items i where i.deleted_at is null and i.active loop
    perform public.hc_ensure_day(u.user_id, public.hc_local_today(u.user_id));
  end loop;

  -- (2) 3시간 넘게 지연된 알림은 발송하지 않고 정리
  update public.hc_occ set next_notify_at = null
   where status = 'pending' and next_notify_at < now() - interval '3 hours';

  -- (3) 발송 대상 확정 + 다음 재알림 시각 계산
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
  select g.user_id, s.endpoint, s.p256dh, s.auth, g.payload
  from grp g join public.hc_push_subs s on s.user_id = g.user_id;
end $$;

create or replace function public.hc_push_test_targets(p_user uuid)
returns table (endpoint text, p256dh text, auth text)
language sql security definer set search_path = public as $$
  select endpoint, p256dh, auth from public.hc_push_subs where user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
alter table public.hc_profiles     enable row level security;
alter table public.hc_items        enable row level security;
alter table public.hc_occ          enable row level security;
alter table public.hc_days         enable row level security;
alter table public.hc_push_subs    enable row level security;
alter table public.hc_rules        enable row level security;
alter table public.hc_messages     enable row level security;
alter table public.hc_banners      enable row level security;
alter table public.hc_templates    enable row level security;
alter table public.hc_admin_emails enable row level security;

drop policy if exists hc_profiles_own on public.hc_profiles;
create policy hc_profiles_own on public.hc_profiles for select to authenticated using (user_id = auth.uid());

drop policy if exists hc_items_own on public.hc_items;
create policy hc_items_own on public.hc_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists hc_occ_own on public.hc_occ;
create policy hc_occ_own on public.hc_occ for select to authenticated using (user_id = auth.uid());

drop policy if exists hc_rules_read on public.hc_rules;
create policy hc_rules_read on public.hc_rules for select to authenticated using (true);
drop policy if exists hc_rules_admin on public.hc_rules;
create policy hc_rules_admin on public.hc_rules for update to authenticated using (public.hc_is_admin()) with check (public.hc_is_admin());

drop policy if exists hc_messages_admin on public.hc_messages;
create policy hc_messages_admin on public.hc_messages for all to authenticated using (public.hc_is_admin()) with check (public.hc_is_admin());

drop policy if exists hc_banners_admin on public.hc_banners;
create policy hc_banners_admin on public.hc_banners for all to authenticated using (public.hc_is_admin()) with check (public.hc_is_admin());

drop policy if exists hc_templates_read on public.hc_templates;
create policy hc_templates_read on public.hc_templates for select to authenticated using (active or public.hc_is_admin());
drop policy if exists hc_templates_admin on public.hc_templates;
create policy hc_templates_admin on public.hc_templates for all to authenticated using (public.hc_is_admin()) with check (public.hc_is_admin());
-- hc_days, hc_push_subs, hc_admin_emails: 정책 없음 = 직접 접근 불가 (함수 경유만)

-- ---------------------------------------------------------------------------
-- 7. 권한 (anon 기본 EXECUTE 명시 회수)
-- ---------------------------------------------------------------------------
-- 공유 프로젝트이므로 hc_ 테이블에만 적용 (기존 서비스 테이블 권한은 건드리지 않음)
revoke all on public.hc_profiles, public.hc_items, public.hc_occ, public.hc_days, public.hc_push_subs,
              public.hc_rules, public.hc_messages, public.hc_banners, public.hc_templates, public.hc_admin_emails
  from anon;
revoke all on public.hc_days, public.hc_push_subs, public.hc_admin_emails from authenticated;
grant select, insert, update, delete on public.hc_items to authenticated;
grant select on public.hc_occ, public.hc_profiles, public.hc_templates, public.hc_rules to authenticated;
grant select, insert, update, delete on public.hc_messages, public.hc_banners to authenticated;
grant update on public.hc_rules to authenticated;
grant insert, update, delete on public.hc_templates to authenticated;
grant usage, select on sequence public.hc_messages_id_seq, public.hc_banners_id_seq to authenticated;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'hc\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function public.hc_is_admin()                       to authenticated;
grant execute on function public.hc_me()                             to authenticated;
grant execute on function public.hc_update_profile(text, text, boolean) to authenticated;
grant execute on function public.hc_day(date)                        to authenticated;
grant execute on function public.hc_set_status(uuid, text)           to authenticated;
grant execute on function public.hc_stats(date, date)                to authenticated;
grant execute on function public.hc_item_stats(int)                  to authenticated;
grant execute on function public.hc_category_stats(int)              to authenticated;
grant execute on function public.hc_feedback()                       to authenticated;
grant execute on function public.hc_summary()                        to authenticated;
grant execute on function public.hc_banner()                         to authenticated;
grant execute on function public.hc_apply_template(text, date)       to authenticated;
grant execute on function public.hc_save_push(text, text, text, text) to authenticated;
grant execute on function public.hc_delete_push(text)                to authenticated;
grant execute on function public.hc_done_by_tokens(uuid[])           to anon, authenticated;
grant execute on function public.hc_snooze_by_tokens(uuid[], int)    to anon, authenticated;
grant execute on function public.hc_due_push()                       to service_role;
grant execute on function public.hc_push_test_targets(uuid)          to service_role;
-- 트리거 함수는 테이블 소유자 권한으로 실행되므로 별도 권한 불필요
