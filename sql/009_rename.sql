-- ============================================================================
-- 루틴원 v0.2.2 (2026-11-13): 서비스 이름 변경 K1 Daily → 루틴원 (Routine One)
-- 하단 공지 배너 문구만 바꿈 (재실행 가능)
-- ============================================================================
update public.hc_banners
   set body = replace(body, 'K1 Daily', '루틴원')
 where body like '%K1 Daily%';

select id, kind, body, active from public.hc_banners order by id;
