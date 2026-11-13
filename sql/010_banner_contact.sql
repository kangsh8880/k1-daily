-- 루틴원 (2026-11-13): 하단 공지 배너에 '문의하기' 메일 링크 연결 (재실행 가능)
update public.hc_banners
   set link_url   = 'mailto:contact@k1ff.com?subject=%5B%EB%A3%A8%ED%8B%B4%EC%9B%90%5D%20%EB%AC%B8%EC%9D%98',
       link_label = '문의하기'
 where kind = 'notice' and body like '%관리자에게 알려%';

select id, body, link_url, link_label from public.hc_banners order by id;
