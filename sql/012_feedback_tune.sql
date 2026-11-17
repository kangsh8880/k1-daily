-- ============================================================================
-- 루틴원 (2026-11-17): 응원 메시지 보완 (재실행 가능)
--  ① 규칙별 문구 2개 → 7개 (5개씩 추가, 같은 문구는 중복 입력 안 함)
--  ② 완벽한 하루: 오늘 전체 회차의 절반(min_share 50%) 이상 시간이 지났을 때만 표시
--  ③ 기간 완주: 제균 치료 전용 문구("결과 확인 검사")를 일반 문구로 교체
--  ④ 연속 달성·하락 경고는 어제까지 기록으로 판단 (설계 유지, 설명만 보강)
-- ============================================================================

-- ① 문구 추가
insert into public.hc_messages(rule_code, body)
select v.rule_code, v.body from (values
  ('START', '{이름}님, 루틴원에 오신 걸 환영해요. 오늘은 알림이 오면 바로 체크하는 것 하나만 해 봐요.'),
  ('START', '첫 체크가 가장 어렵습니다. 하나만 완료해도 오늘은 성공이에요.'),
  ('START', '시작이 반입니다. 오늘 할 일 중 가장 쉬운 것부터 눌러 보세요.'),
  ('START', '{이름}님의 첫날을 응원합니다. 완벽보다 꾸준함이 목표예요.'),
  ('START', '알림 시간이 생활과 안 맞으면 항목 화면에서 언제든 바꿀 수 있어요.'),
  ('PERIOD_DONE', '"{항목}" 기간을 끝까지 해냈습니다. 정말 대단해요, {이름}님.'),
  ('PERIOD_DONE', '"{항목}" 완주! 끝까지 지킨 경험이 다음 습관의 힘이 됩니다.'),
  ('PERIOD_DONE', '정해진 기간을 지켜 낸 {이름}님, 오늘은 스스로를 칭찬해 주세요.'),
  ('PERIOD_DONE', '"{항목}" 기간 완료. 계속 이어 갈 항목이 있다면 기간을 늘려 보세요.'),
  ('PERIOD_DONE', '기간 목표 달성! 작은 약속을 지키는 힘이 쌓이고 있어요.'),
  ('PERFECT_TODAY', '지금까지 하나도 놓치지 않았어요. 남은 시간도 이 흐름 그대로!'),
  ('PERFECT_TODAY', '{이름}님, 오늘 지금까지 {준수율}%. 흠잡을 데 없는 하루예요.'),
  ('PERFECT_TODAY', '완벽한 페이스입니다. 루티도 신났어요.'),
  ('PERFECT_TODAY', '오늘의 나, 아주 잘하고 있어요. 남은 체크도 가볍게 가요.'),
  ('PERFECT_TODAY', '빈틈없는 하루가 쌓이면 습관이 됩니다. 오늘 정말 좋아요.'),
  ('RECOVERY', '어제보다 훨씬 좋아졌어요. 다시 돌아오는 힘, 그게 실력입니다.'),
  ('RECOVERY', '흔들려도 다시 시작하면 됩니다. 오늘 {준수율}%, 멋진 반등이에요.'),
  ('RECOVERY', '{이름}님, 오늘 확실히 살아났어요. 내일도 이 느낌 그대로!'),
  ('RECOVERY', '넘어진 다음 날이 가장 중요합니다. 오늘 아주 잘 해내셨어요.'),
  ('RECOVERY', '어제의 아쉬움을 오늘 바로 만회했네요. 박수 보냅니다.'),
  ('STREAK', '{연속일수}일째 이어지고 있어요. 이제 루틴이 생활이 되는 중입니다.'),
  ('STREAK', '연속 {연속일수}일! 이 기록, 쉽게 끊기 아깝죠?'),
  ('STREAK', '{이름}님의 꾸준함이 {연속일수}일째 빛나고 있어요.'),
  ('STREAK', '{연속일수}일 연속 달성. 오늘도 기록을 하루 더 늘려 봐요.'),
  ('STREAK', '습관은 반복에서 나옵니다. {연속일수}일 연속, 정말 잘하고 있어요.'),
  ('DROP', '최근 조금 지쳤나요? 오늘은 꼭 필요한 항목 하나만 지켜도 충분해요.'),
  ('DROP', '최근 3일 평균 {3일평균}%. 알림 시간을 생활 리듬에 맞게 조정해 볼까요?'),
  ('DROP', '쉬어 가도 괜찮아요. 중요한 건 다시 체크 버튼을 누르는 거예요.'),
  ('DROP', '항목이 너무 많다면 잠시 일시중지해 두고 핵심만 이어 가 보세요.'),
  ('DROP', '{이름}님, 오늘 하나만 완료해도 흐름은 다시 시작됩니다.'),
  ('MISS_ITEM', '"{항목}"이 며칠째 빠졌어요. 시간을 옮기거나 다른 습관 바로 뒤에 붙여 보세요.'),
  ('MISS_ITEM', '"{항목}", 지금 생활에 맞지 않는다면 횟수를 줄여 다시 시작해 봐요.'),
  ('MISS_ITEM', '"{항목}" 알림이 오면 3초 안에 시작하기, 오늘 한 번만 해 봐요.'),
  ('MISS_ITEM', '자주 놓치는 "{항목}"은 쉬운 버전으로 바꾸는 것도 좋은 방법이에요.'),
  ('MISS_ITEM', '"{항목}"을 다시 챙겨 볼까요? 오늘 한 번이면 충분합니다.'),
  ('DEFAULT', '오늘도 한 걸음씩. 최근 7일 준수율 {7일준수율}%.'),
  ('DEFAULT', '{이름}님, 체크 하나하나가 내일의 나를 만듭니다.'),
  ('DEFAULT', '꾸준함은 재능을 이깁니다. 오늘 준수율 {준수율}%.'),
  ('DEFAULT', '작은 체크가 모여 큰 변화가 됩니다. 오늘도 함께해요.'),
  ('DEFAULT', '루티가 응원하고 있어요. 다음 알림도 바로 체크!')
) as v(rule_code, body)
where not exists (select 1 from public.hc_messages m where m.rule_code = v.rule_code and m.body = v.body);

-- ③ 기간 완주 제균 전용 문구 교체
update public.hc_messages
   set body = '{항목} 기간을 완주했습니다. 다음 목표도 같은 방법으로 이어 가 보세요.', updated_at = now()
 where rule_code = 'PERIOD_DONE' and body like '%결과 확인 검사%';

-- ②·④ 규칙 기준값·설명
update public.hc_rules
   set params = params || '{"min_share":50}'::jsonb,
       description = '오늘 지난 회차 모두 완료 (지난 회차 ≥ min_due, 오늘 전체 회차의 min_share% 이상 시간 경과)',
       updated_at = now()
 where code = 'PERFECT_TODAY';
update public.hc_rules set description = '어제까지 준수율 ≥ min_rate 가 min_days 일 이상 연속 (오늘은 진행 중이라 제외)', updated_at = now() where code = 'STREAK';
update public.hc_rules set description = '최근 3일(어제까지) 평균 준수율 < below (오늘은 진행 중이라 제외)', updated_at = now() where code = 'DROP';

-- ② 룰 엔진 갱신 (완벽한 하루 조건 강화)

create or replace function public.hc_feedback_core(p_user uuid)
returns table (rule_code text, rule_name text, message text, priority int)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := p_user;
  v_today date; v_name text;
  v_t record; v_y record;
  v_avg3 numeric; v_cnt3 int; v_streak int; v_rate7 numeric;
  v_item text; v_first boolean; v_daytotal int;
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
  select count(*) into v_daytotal from public.hc_occ where user_id = v_uid and occ_date = v_today;

  v_vars := jsonb_build_object('이름', v_name,
                               '준수율', coalesce(to_char(v_t.rate, 'FM990.0'), '-'),
                               '7일준수율', coalesce(to_char(v_rate7, 'FM990.0'), '-'));

  for r in select * from public.hc_rules where active order by priority loop
    p := r.params;
    v_msg := null;

    if r.code = 'START' and v_first then
      v_msg := public.hc_pick_message(r.code, v_vars);

    elsif r.code = 'PERFECT_TODAY' and coalesce(v_t.total, 0) >= coalesce((p->>'min_due')::int, 3)
          and v_t.done >= v_t.total
          and v_t.total * 100.0 >= v_daytotal * coalesce((p->>'min_share')::numeric, 50) then
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

revoke all on function public.hc_feedback_core(uuid) from public, anon, authenticated;

-- 결과 확인: 규칙별 문구 수와 기준값
select r.priority as 순위, r.name as 규칙, r.params as 기준값,
       count(m.id) filter (where m.active) as 문구수
  from public.hc_rules r left join public.hc_messages m on m.rule_code = r.code
 group by r.code, r.priority, r.name, r.params
 order by r.priority;
