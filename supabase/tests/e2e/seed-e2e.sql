-- Extra seed for the two-person e2e flows (local Supabase only; runs after seed.sql on
-- `supabase db reset --local`). Fictional. One untouched member per flow, so specs never share
-- state: list B, numbers 901–904, group B (500/month), active since 1 January, nothing paid.
-- Committee accounts are made by helpers.ts bootstrap() (they need the Auth API).
select public.add_member(901, 'اختبار الدفع', 'B', make_date(extract(year from current_date)::int, 1, 1),
                         '+22200000901', p_list_code => 'B');
select public.add_member(902, 'اختبار الرفض', 'B', make_date(extract(year from current_date)::int, 1, 1),
                         '+22200000902', p_list_code => 'B');
select public.add_member(903, 'اختبار الحملة', 'B', make_date(extract(year from current_date)::int, 1, 1),
                         '+22200000903', p_list_code => 'B');
select public.add_member(904, 'اختبار النقد', 'B', make_date(extract(year from current_date)::int, 1, 1),
                         '+22200000904', p_list_code => 'B');
