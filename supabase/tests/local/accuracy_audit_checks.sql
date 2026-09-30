-- Included by supabase/tests/m1_test.sql: every accuracy audit check (app_private.accuracy_audit(),
-- m35) must pass on the test data. The fee-completeness alert is skipped here: the tests
-- deliberately keep groups without a fee (no_price cases).
select tests.ok(x.ok, 'accuracy: ' || x.check_name || ' (' || x.detail || ')')
from app_private.accuracy_audit() x
where x.check_name <> 'every active month has a fee (its year, or an earlier one)';
select tests.ok((select count(*) from app_private.accuracy_audit()) = 29, 'the audit runs 29 checks');
