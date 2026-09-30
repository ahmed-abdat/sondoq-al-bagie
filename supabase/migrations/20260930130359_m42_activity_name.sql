-- m42: the owner's spelling of the first expense activity: «التدريس المحظري» (was «التدريس المحوري»
-- in the m38 seed). Production was renamed by hand on 2026-09-30 (audited), so there this is a
-- no-op; fresh databases (run.sh, the e2e stack, branches) now match production.
update public.expense_activities set name = 'التدريس المحظري'
where legacy_category = 'teaching' and name = 'التدريس المحوري';
