-- Local/dev seed: three FICTIONAL members (groups and prices come from the migrations).
-- Never run against the production project; real members come from the paper-sheet import.
select public.add_member(901, 'عضو تجريبي أول', 'A', '2026-01-01', '+22200000001');
select public.add_member(902, 'عضو تجريبي ثان', 'B', '2026-01-01', '+22200000002');
select public.add_member(903, 'عضو تجريبي ثالث', 'A', '2026-03-01', null);
