-- ============================================================================
-- 루틴원 - 002 기준정보 (룰 / 응원 메시지 / 배너 / 템플릿 / 관리자)
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
    ('notice', '루틴원 시범 운영 중입니다. 불편한 점은 관리자에게 알려 주세요.', 1);
  end if;
end $$;

-- 추천 세트 (일반용, 2026-11-04 정비). 개인 처방 세트는 비활성
insert into public.hc_templates(code, name, description, period_days, sort, active, items) values
('hp_eradication_14d', '헬리코박터 제균 14일 (비활성)', '개인 처방용 - 목록에 표시하지 않음', 14, 99, false, '[]'::jsonb)
on conflict (code) do nothing;
update public.hc_templates set active = false where code = 'hp_eradication_14d';

insert into public.hc_templates(code, name, description, period_days, sort, active, items) values
('lifestyle_basic', '생활습관 기본 세트', '누구나: 체중·물·걷기·식사·산책·금식·스트레칭 (시간은 불러온 뒤 내 생활에 맞게 수정)', null, 1, true, '[
  {"title":"공복 체중 기록","category":"건강측정","times":["06:30"],"note":"기상 후 화장실 다녀온 뒤"},
  {"title":"물 마시기 점검","category":"식사·수분","times":["10:00","14:00","17:00"],"note":"하루 1.5L 목표, 식사 사이에 나눠 마시기"},
  {"title":"일어나서 2~3분 걷기","category":"운동","times":["10:30","14:30","16:30"],"days":[1,2,3,4,5],"note":"1~2시간마다 의자에서 일어나기"},
  {"title":"싱겁게 먹기 (국물 반 공기 이하)","category":"식사·수분","times":["12:40","19:20"],"note":"건더기 위주, 국물·양념 남기기"},
  {"title":"저녁 식후 산책 30분","category":"운동","times":["20:00"],"note":"식후 30분 뒤 시작"},
  {"title":"저녁 8시 이후 금식","category":"식사·수분","times":["21:00"]},
  {"title":"취침 전 스트레칭 5분","category":"운동","times":["22:00"]}
]'::jsonb),
('bp_daily', '혈압 관리', '혈압 측정 아침·저녁 + 혈압약 1회 (약 이름·시간은 본인 처방에 맞게 수정)', null, 2, true, '[
  {"title":"혈압 측정","category":"건강측정","times":["07:00","21:30"],"note":"아침은 혈압약 복용 전, 앉아서 5분 쉰 뒤 측정"},
  {"title":"혈압약 복용","category":"복약","times":["08:00"],"note":"본인 약 이름·복용 시간으로 수정"}
]'::jsonb),
('meds_basic', '복약 알림 기본', '하루 2회(아침·저녁 식후) 약 복용 알림 (약 이름·횟수는 본인 처방에 맞게 수정)', null, 3, true, '[
  {"title":"아침 약 복용","category":"복약","times":["08:00"],"note":"약 이름으로 수정"},
  {"title":"저녁 약 복용","category":"복약","times":["19:30"],"note":"약 이름으로 수정"}
]'::jsonb),
('men_health', '남성 건강 (전립선)', '케겔 운동 하루 3회 + 야간뇨 예방', null, 4, true, '[
  {"title":"케겔 운동 1세트","category":"운동","times":["07:30","12:30","18:30"],"note":"5초 조이기·5초 풀기 × 10회, 숨 참지 않기"},
  {"title":"취침 2시간 전 물 줄이기","category":"생활","times":["21:00"],"note":"야간뇨 예방"}
]'::jsonb),
('exercise_weekly', '운동 습관 (주 3회)', '월·수·금 근력운동 + 주말 유산소', null, 5, true, '[
  {"title":"근력운동 20분 (스쿼트·팔굽혀펴기·플랭크)","category":"운동","times":["19:30"],"days":[1,3,5],"note":"하체 위주, 숨 참지 않기"},
  {"title":"유산소 운동 40분 (걷기·자전거·수영)","category":"운동","times":["09:00"],"days":[6,7]}
]'::jsonb)
on conflict (code) do update set name = excluded.name, description = excluded.description, period_days = excluded.period_days,
  sort = excluded.sort, active = excluded.active, items = excluded.items;

-- 분류 보완 세트 (2026-11-06)
insert into public.hc_templates(code, name, description, period_days, sort, active, items) values
('sleep_basic', '수면 습관', '같은 시각에 자고 일어나기, 잠들기 전 화면 끄기, 오후 카페인 줄이기', null, 6, true, '[
  {"title":"기상 시각 지키기 (주말 포함)","category":"수면","times":["06:30"],"note":"주말도 평일과 1시간 이내 차이"},
  {"title":"오후 2시 이후 카페인 끊기","category":"수면","times":["14:00"],"note":"커피·녹차·에너지음료"},
  {"title":"휴대폰·TV 끄기 (취침 1시간 전)","category":"수면","times":["22:00"],"note":"침실에 휴대폰 두지 않기"},
  {"title":"23시 이전 잠자리 들기","category":"수면","times":["22:50"],"note":"7시간 이상 수면 목표"}
]'::jsonb),
('mind_basic', '마음 관리', '스트레스를 줄이는 하루 3분 습관: 호흡, 기분 기록, 감사일기', null, 7, true, '[
  {"title":"심호흡·명상 3분","category":"마음 관리","times":["12:50"],"note":"4초 들이쉬고 6초 내쉬기 × 10회"},
  {"title":"오늘 기분 기록 (1~5점)","category":"마음 관리","times":["21:30"],"note":"점수와 이유 한 줄"},
  {"title":"감사일기 1줄","category":"마음 관리","times":["22:10"],"note":"오늘 고마웠던 일 1가지"}
]'::jsonb),
('relation_family', '관계·가족', '가족·지인과의 연결 습관 (요일은 각자 맞게 수정)', null, 8, true, '[
  {"title":"가족에게 안부 연락","category":"관계·가족","times":["20:30"],"days":[3,7],"note":"전화나 영상통화"},
  {"title":"휴대폰 없이 가족과 식사","category":"관계·가족","times":["19:00"],"days":[6,7]},
  {"title":"고마운 사람에게 메시지 1통","category":"관계·가족","times":["12:30"],"days":[5]}
]'::jsonb),
('learning_basic', '학습·자기계발', '외국어·독서·강의를 매일 조금씩', null, 9, true, '[
  {"title":"외국어 단어 10개","category":"학습·자기계발","times":["07:30"],"days":[1,2,3,4,5],"note":"출근 전 또는 이동 중"},
  {"title":"독서 20분","category":"학습·자기계발","times":["21:40"]},
  {"title":"온라인 강의 1개","category":"학습·자기계발","times":["20:30"],"days":[2,4]}
]'::jsonb),
('work_execution', '업무 실행력', '하루 계획 → 핵심 업무 완료 → 마감 점검 → 주간 회고', null, 10, true, '[
  {"title":"오늘 할 일 3개 정하기","category":"업무","times":["08:30"],"days":[1,2,3,4,5],"note":"가장 중요한 1개에 표시"},
  {"title":"오전 중 핵심 업무 1건 완료","category":"업무","times":["11:50"],"days":[1,2,3,4,5]},
  {"title":"업무 마감 점검·내일 준비","category":"업무","times":["17:20"],"days":[1,2,3,4,5],"note":"미완료 항목 내일로 옮기기"},
  {"title":"주간 회고 (잘한 점·개선할 점)","category":"업무","times":["16:30"],"days":[5]}
]'::jsonb)
on conflict (code) do update set name = excluded.name, description = excluded.description, period_days = excluded.period_days,
  sort = excluded.sort, active = excluded.active, items = excluded.items;
