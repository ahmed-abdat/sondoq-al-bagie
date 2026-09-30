-- Undo m42 (activity name): the m38 seed spelling again. Dev/branch only (on production the rename
-- was the owner's own); also run first by m2_down.sql.
set client_min_messages = warning;
update public.expense_activities set name = 'التدريس المحوري'
where legacy_category = 'teaching' and name = 'التدريس المحظري';
