-- Local/dev seed: 70 FICTIONAL members shaped like the real fund (never run on production;
-- real members come from the paper-sheet import). Groups A = 1000, B = 500 come from the
-- migrations. Deterministic (setseed). Roughly: 45 % paid the whole year, 40 % paid nothing,
-- the rest part of the year. January–June came from the paper sheet; later months by wallet.
-- Committee accounts are not seeded: create a user in Studio → Auth, then
--   select public.set_committee_member('<user id>', 'مدير تجريبي', 'admin');

select public.update_settings(p_opening_balance => 150000, p_whatsapp_contact => '+22200000000');
select public.add_fund_account('bankily', '22000001', 'رابطة البقيع', null, 1);
select public.add_fund_account('masrvi', '22000002', 'رابطة البقيع', null, 2);
select public.add_fund_account('sedad', '22000003', 'أمين الصندوق', 'للتحويل من السداد', 3);

do $$
declare
  firsts text[] := array['محمد', 'أحمد', 'سيدي', 'الشيخ', 'عبد الله', 'محمد الأمين', 'إبراهيم', 'يحيى', 'المختار',
                         'الحسن', 'عبد الرحمن', 'محمدن', 'أحمدو', 'سيد أحمد', 'الطالب', 'عمر', 'حمادي', 'بابا',
                         'إسماعيل', 'موسى'];
  families text[] := array['أحمد', 'محمد', 'سيدي', 'عبد الله', 'المختار', 'الشيخ', 'الحسن', 'إبراهيم', 'باب',
                           'محمود'];
  wallets public.payment_method[] := array['bankily', 'masrvi', 'sedad', 'bankily', 'cash']::public.payment_method[];
  y int := extract(year from current_date);
  cur int := extract(month from current_date);
  n int;
  grp text;
  price int;
  mid uuid;
  r float;
  paid int;
  paper_to int;
  alloc jsonb;
begin
  perform setseed(0.2026);
  for n in 1..70 loop
    grp := case when random() < 0.6 then 'A' else 'B' end;
    price := case grp when 'A' then 1000 else 500 end;
    mid := public.add_member(n, firsts[1 + floor(random() * 20)::int] || ' ولد ' || families[1 + floor(random() * 10)::int],
                             grp, make_date(y, 1, 1),
                             case when random() < 0.8 then '+222000' || lpad(n::text, 5, '0') end);
    r := random();
    paid := case when r < 0.45 then 12 when r < 0.85 then 0 else 1 + floor(random() * greatest(cur - 1, 1))::int end;
    continue when paid = 0;

    paper_to := least(paid, 6);
    select jsonb_agg(jsonb_build_object('kind', 'months', 'member_id', mid, 'year', y, 'month', m, 'amount', price))
      into alloc from generate_series(1, paper_to) m;
    perform public.record_payment(gen_random_uuid(), 'سجل ورقي', 'paper', paper_to * price, make_date(y, least(paper_to, cur), 1),
                                  alloc, p_note => 'سجل ورقي ' || y);
    continue when paid <= 6;

    select jsonb_agg(jsonb_build_object('kind', 'months', 'member_id', mid, 'year', y, 'month', m, 'amount', price))
      into alloc from generate_series(7, paid) m;
    perform public.record_payment(gen_random_uuid(), 'دافع تجريبي ' || n, wallets[1 + floor(random() * 5)::int],
                                  (paid - 6) * price, least(make_date(y, least(paid, cur), 1) + 3, current_date), alloc,
                                  p_txn_ref => case when random() < 0.9 then 'SEED' || lpad(n::text, 8, '0') end);
  end loop;
end $$;

-- Two transfers waiting for the treasurer (current month, members who paid nothing). Inserted
-- directly because the server's record_payment confirms at once; one block = one transaction.
do $$
declare
  w record;
  pid uuid;
begin
  for w in
    select m.id as member_id, m.number, gp.monthly_amount as amount
    from public.members m
    join public.membership_periods mp on mp.member_id = m.id
    join public.group_prices gp on gp.group_id = mp.group_id and gp.year = extract(year from current_date)
    where not exists (select 1 from public.payment_months pm where pm.member_id = m.id)
    order by m.number limit 2
  loop
    pid := gen_random_uuid();
    insert into public.payments (id, payer_name, method, amount, paid_on, txn_ref)
    values (pid, 'دافع ينتظر ' || w.number, 'bankily', w.amount, current_date, 'PEND' || lpad(w.number::text, 8, '0'));
    insert into public.payment_allocations (payment_id, kind, member_id, year, month, amount)
    values (pid, 'months', w.member_id, extract(year from current_date), extract(month from current_date), w.amount);
  end loop;
end $$;

-- Expenses and one donation campaign.
select public.record_expense(gen_random_uuid(), current_date - 40, 'teaching', 20000, 'رواتب المعلم');
select public.record_expense(gen_random_uuid(), current_date - 12, 'sports', 7500, 'كرات وأقمصة');
insert into public.campaigns (id, title, purpose, target_amount, amount_mode)
values ('00000000-0000-0000-0000-00000000ca01', 'ترميم المسجد', 'إصلاح السقف قبل موسم الأمطار', 300000, 'open');
select public.record_payment(gen_random_uuid(), 'متبرع من الخارج', 'bankily', 50000, current_date - 5,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', '00000000-0000-0000-0000-00000000ca01',
                                       'member_id', null, 'amount', 50000)));
select public.record_payment(gen_random_uuid(), m.full_name, 'masrvi', 10000, current_date - 2,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', '00000000-0000-0000-0000-00000000ca01',
                                       'member_id', m.id, 'amount', 10000)))
from public.members m where m.number in (3, 5);
