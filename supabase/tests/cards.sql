\pset tuples_only on
\pset format unaligned
select test.claims('1001') as m1 \gset
set role authenticated;
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
\echo '--- 3 months'
select string_agg(format(E'[%s] %s\n    %s\n    → %s', c ->> 'severity', c ->> 'title', c ->> 'body', c ->> 'recommendation'), E'\n')
  from jsonb_array_elements(public.insight_cards(now() - interval '92 days', now())) c;
\echo '--- 30 days, Участок дробления'
select string_agg(format(E'[%s] %s\n    %s\n    → %s', c ->> 'severity', c ->> 'title', c ->> 'body', c ->> 'recommendation'), E'\n')
  from jsonb_array_elements(public.insight_cards(now() - interval '30 days', now(), '{"area_id": 2}')) c;
