-- ============================================================================
-- 루틴원 v0.2.1 (2026-11-10): 알림 구독 자동 유지
--  브라우저가 푸시 구독을 만료·교체(pushsubscriptionchange)하면 서비스워커가 로그인 없이 새 구독으로 교체
--  소유 확인: 옛 구독 주소(endpoint)를 알고 있어야만 교체 가능
-- ============================================================================
create or replace function public.hc_replace_push(p_old text, p_endpoint text, p_p256dh text, p_auth text)
returns int language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from public.hc_push_subs where endpoint = p_old;
  if v_user is null or p_endpoint is null or p_endpoint !~ '^https://' then return 0; end if;
  delete from public.hc_push_subs where endpoint = p_old;
  insert into public.hc_push_subs(endpoint, user_id, p256dh, auth, ua)
  values (p_endpoint, v_user, p_p256dh, p_auth, 'auto-renew')
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  return 1;
end $$;
revoke all on function public.hc_replace_push(text, text, text, text) from public;
grant execute on function public.hc_replace_push(text, text, text, text) to anon, authenticated;

-- 확인: 내 알림 기기 현황 (등록 시각, 마지막 발송 성공 시각)
select left(s.endpoint, 45) || '…' as 기기, s.ua like '%Android%' as 안드로이드,
       to_char(s.created_at at time zone 'Asia/Ho_Chi_Minh', 'MM-DD HH24:MI') as 등록,
       to_char(s.last_ok_at at time zone 'Asia/Ho_Chi_Minh', 'MM-DD HH24:MI') as 마지막_발송성공
from public.hc_push_subs s join auth.users u on u.id = s.user_id
where u.email = 'kangsh8880@gmail.com'
order by s.created_at desc;
