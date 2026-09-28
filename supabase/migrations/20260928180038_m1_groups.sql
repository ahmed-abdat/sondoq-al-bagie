-- The two groups confirmed by the committee and their 2026 prices (MRO per month).
insert into public.groups (code, name) values ('A', 'المجموعة أ'), ('B', 'المجموعة ب') on conflict (code) do nothing;
insert into public.group_prices (group_id, year, monthly_amount)
select g.id, 2026, case g.code when 'A' then 1000 else 500 end from public.groups g
on conflict (group_id, year) do nothing;
