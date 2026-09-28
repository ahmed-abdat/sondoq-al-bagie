-- Local/dev seed: groups A/B with 2026 prices and three FICTIONAL members.
-- Never run against the production project (real members come from the paper-sheet import).
insert into public.groups (code, name) values ('A', 'المجموعة أ'), ('B', 'المجموعة ب') on conflict (code) do nothing;
insert into public.group_prices (group_id, year, monthly_amount)
select g.id, 2026, case g.code when 'A' then 1000 else 500 end from public.groups g
on conflict (group_id, year) do nothing;

select public.add_member(901, 'عضو تجريبي أول', 'A', '2026-01-01', '+22200000001');
select public.add_member(902, 'عضو تجريبي ثان', 'B', '2026-01-01', '+22200000002');
select public.add_member(903, 'عضو تجريبي ثالث', 'A', '2026-03-01', null);
