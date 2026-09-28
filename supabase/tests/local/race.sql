-- Setup for the concurrency check in run.sh. Committed on the throwaway DB only.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'race-t@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'race-d@test.invalid');
select public.set_committee_member('00000000-0000-0000-0000-0000000000b1', 'أمين السباق', 'treasurer');
select public.set_committee_member('00000000-0000-0000-0000-0000000000b2', 'نائب السباق', 'deputy');
insert into public.group_prices (group_id, year, monthly_amount)
select id, extract(year from current_date), 1000 from public.groups where code = 'A' on conflict do nothing;
select public.add_member(1901, 'عضو السباق', 'A', date_trunc('month', current_date)::date);
select public.add_member(1902, 'عضو السباق ٢', 'A', date_trunc('month', current_date)::date);

-- f1: one payment, two confirmers at once.  f2 / f3: two payments for the same month.
insert into public.payments (id, payer_name, method, amount, paid_on) values
  ('00000000-0000-0000-0000-0000000000f1', 'x', 'cash', 1000, current_date),
  ('00000000-0000-0000-0000-0000000000f2', 'x', 'cash', 1000, current_date),
  ('00000000-0000-0000-0000-0000000000f3', 'x', 'cash', 1000, current_date);
insert into public.payment_allocations (payment_id, kind, member_id, year, month, amount)
select p.id, 'months', m.id, extract(year from current_date), extract(month from current_date), 1000
from public.members m, (values ('00000000-0000-0000-0000-0000000000f1'::uuid, 1901),
                               ('00000000-0000-0000-0000-0000000000f2'::uuid, 1902),
                               ('00000000-0000-0000-0000-0000000000f3'::uuid, 1902)) p(id, num)
where m.number = p.num;
commit;
