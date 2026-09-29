/* ───────────── M27: money is private ───────────── */

select tests.login('server');
select tests.ok(tests.money_columns((select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                     where n.nspname = 'public' and c.relkind in ('v', 'r', 'm')
                                       and has_table_privilege('anon', c.oid, 'select'))) = '{}',
  'no relation strangers can read has a money column');
select tests.login('public');
select tests.throws('select balance from public.fund_summary', '42501', 'strangers cannot read the balance');
select tests.throws('select amount from public.activity_feed', '42501', 'strangers cannot read activity amounts');
select tests.throws('select * from public.member_status', '42501', 'strangers read member_status_public instead');
select tests.login('former');
select tests.ok((select count(*) from public.fund_summary) = 0 and (select count(*) from public.activity_feed) = 0,
  'a signed-in account that is not active committee sees no money');
select tests.login('committee');
select tests.ok((select count(*) from public.fund_summary) = 1, 'the committee reads the money');
select tests.login('service');
select tests.ok((select count(*) from public.fund_summary) = 1, 'our server reads money for members');
