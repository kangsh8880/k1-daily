-- ============================================================================
-- K1 Daily - 002 기준정보 (룰 / 응원 메시지 / 배너 / 템플릿 / 관리자)
-- 재실행 가능: 룰·템플릿은 갱신, 메시지·배너는 비어 있을 때만 입력
-- ============================================================================

-- 관리자 (응원 메시지·배너·룰 관리 화면 접근)
insert into public.hc_admin_emails(email) values ('kangsh8880@gmail.com') on conflict do nothing;

-- 룰 (priority 작을수록 우선, 화면에는 상위 2건 표시)
insert into public.hc_rules(code, name, description, priority, params) values
 ('START',         '시작 환영',     '첫날(과거 기록 없음)',                                   5,  '{}'),
 ('PERIOD_DONE',   '기간 완주',     '기간형 항목 종료일(오늘·어제) + 기간 준수율 ≥ min_rate', 10, '{"min_rate":80}'),
 ('PERFECT_TODAY', '완벽한 하루',   '오늘 지난 회차 모두 완료 (지난 회차 ≥ min_due)',        20, '{"min_due":3}'),
 ('RECOVERY',      '회복',          '어제 < prev_below, 오늘 ≥ now_above',                     30, '{"prev_below":50,"now_above":80,"min_due":3}'),
 ('STREAK',        '연속 달성',     '어제까지 준수율 ≥ min_rate 가 min_days 일 이상 연속',     40, '{"min_rate":80,"min_days":3}'),
 ('DROP',          '하락 경고',     '최근 3일(어제까지) 평균 준수율 < below',                  50, '{"below":60}'),
 ('MISS_ITEM',     '반복 누락',     '같은 항목을 최근 days 일 연속 하루 한 번도 완료하지 못함',                    60, '{"days":3}'),
 ('DEFAULT',       '기본 응원',     '해당 룰이 없을 때',                                       99, '{}')
on conflict (code) do update set name = excluded.name, description = excluded.description;

-- 응원 메시지 (변수: {이름} {준수율} {7일준수율} {연속일수} {항목} {3일평균})
do $$
begin
  if not exists (select 1 from public.hc_messages) then
    insert into public.hc_messages(rule_code, body) values
    ('START', '{이름}님, 시작을 환영합니다. 오늘은 체크 버튼을 누르는 습관 하나만 만들어 봐요.'),
    ('START', '첫날입니다. 완벽하지 않아도 괜찮아요. 알림이 오면 바로 체크하는 것부터 시작해요.'),
    ('PERIOD_DONE', '{항목} 기간을 완주했습니다. 끝까지 해낸 {이름}님, 정말 대단합니다.'),
    ('PERIOD_DONE', '{항목} 완주를 축하합니다. 이제 결과 확인 검사 일정을 챙겨 주세요.'),
    ('PERFECT_TODAY', '{이름}님, 오늘 지금까지 100% 달성! 이 흐름 그대로 가요.'),
    ('PERFECT_TODAY', '빈틈없는 하루입니다. 오늘의 나에게 박수 한 번.'),
    ('RECOVERY', '다시 돌아오셨네요. 넘어졌다 일어나는 게 진짜 실력입니다. 오늘 {준수율}%.'),
    ('RECOVERY', '어제보다 확실히 좋아졌습니다. 오늘 {준수율}%, 이 속도면 충분합니다.'),
    ('STREAK', '{연속일수}일 연속 달성 중입니다. 습관이 몸에 붙고 있어요.'),
    ('STREAK', '{이름}님, {연속일수}일 연속! 꾸준함이 가장 강한 무기입니다.'),
    ('DROP', '요즘 바쁘셨죠? 최근 3일 평균 {3일평균}%. 가장 쉬운 항목 1개부터 다시 시작해요.'),
    ('DROP', '조금 느슨해졌어요. 알림 시간을 생활 리듬에 맞게 바꿔 보는 것도 방법입니다.'),
    ('MISS_ITEM', '"{항목}"이 며칠째 빠지고 있어요. 시간을 바꾸거나 다른 습관 바로 뒤에 붙여 보세요.'),
    ('MISS_ITEM', '"{항목}" 놓치기 쉬운 항목이네요. 알림 직후 바로 하는 걸 목표로 해 봐요.'),
    ('DEFAULT', '{이름}님, 오늘도 한 걸음씩. 최근 7일 준수율 {7일준수율}%.'),
    ('DEFAULT', '작은 체크가 쌓여 큰 변화를 만듭니다. 오늘 준수율 {준수율}%.');
  end if;

  if not exists (select 1 from public.hc_banners) then
    insert into public.hc_banners(kind, body, weight) values
    ('notice', 'K1 Daily 시범 운영 중입니다. 불편한 점은 관리자에게 알려 주세요.', 1);
  end if;
end $$;

-- 템플릿 (초기 항목 = 2026-11 건강관리 메일 체크리스트 기준)
insert into public.hc_templates(code, name, description, period_days, sort, items) values
('lifestyle_basic', '생활습관 기본 세트', '검진 후 생활습관 개선 항목 (물·식사·운동·금식·케겔 등)', null, 1, '[
  {"title":"공복 체중 기록","category":"건강측정","times":["06:20"],"note":"화장실 다녀온 뒤 공복으로"},
  {"title":"케겔 운동 1세트","category":"운동","times":["07:10","11:30","18:30"],"note":"5초 조이기·5초 풀기 × 10회, 숨 참지 않기"},
  {"title":"물 마시기 점검","category":"식사·수분","times":["11:00","15:00","18:00"],"note":"11시 0.7L / 15시 1L / 18시 1.5L, 식사 사이에"},
  {"title":"일어나서 2~3분 걷기","category":"운동","times":["10:00","14:00","16:00"],"days":[1,2,3,4,5],"note":"1~2시간마다 의자에서 일어나기"},
  {"title":"국물 반 공기 이하","category":"식사·수분","times":["12:40","19:20"],"note":"건더기 위주, 쌀국수 국물·조림 양념 남기기"},
  {"title":"저녁 식후 산책 30분","category":"운동","times":["20:00"],"note":"식후 30분 뒤 시작"},
  {"title":"골프 연습","category":"운동","times":["20:40"],"note":"스트레칭 먼저, 산책에 추가로"},
  {"title":"술·커피 0잔","category":"생활","times":["21:00"],"note":"치료 기간 금주·금커피"},
  {"title":"저녁 8시 이후 금식","category":"식사·수분","times":["21:30"]},
  {"title":"취침 2시간 전 물 줄이기","category":"생활","times":["21:30"],"note":"야간뇨 예방"}
]'::jsonb),
('bp_daily', '혈압 관리', '혈압 측정 아침·저녁 + 혈압약 아침 1회', null, 2, '[
  {"title":"혈압 측정","category":"건강측정","times":["06:45","22:00"],"note":"아침은 혈압약 복용 전. 수축기 100 미만·심한 어지럼 시 약사·의사 연락"},
  {"title":"혈압약 복용 (세비카 5/40mg 1정)","category":"복약","times":["07:00"],"note":"아침 식후. 본인 약 이름으로 수정 가능"}
]'::jsonb),
('hp_eradication_14d', '헬리코박터 제균 14일', '표준 3제 요법 + 무코스타 (시작일부터 14일 자동 종료)', 14, 3, '[
  {"title":"오메프라졸 20mg 1캡슐","category":"복약","times":["06:30","18:00"],"note":"식전 30분"},
  {"title":"아목시실린 500mg 2캡슐","category":"복약","times":["07:00","19:00"],"note":"식후, 12시간 간격"},
  {"title":"클래리스로마이신 250mg 2정","category":"복약","times":["07:00","19:00"],"note":"식후, 12시간 간격"},
  {"title":"무코스타 1정","category":"복약","times":["07:00","12:30","19:00"],"note":"식후"}
]'::jsonb)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  period_days = excluded.period_days, items = excluded.items, sort = excluded.sort;
