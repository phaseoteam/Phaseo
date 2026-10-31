-- phaseo:allow-destructive-migration reason: drops the six unenforced guardrail budget columns (daily/weekly/monthly request and cost limits) on workspace_guardrails. Nothing reads them: the gateway policy lookup never selected them, they have been hidden in the UI since #2866 and deprecated in the API since #2888, and #3132 removed the last writers (web editor, settings-guardrails, control guardrails API). It refuses to run if any guardrail holds a non-zero value, so no set limit is lost.
--
-- Drop the deprecated guardrail budget fields.
--
-- workspace_guardrails carried daily/weekly/monthly request and cost limits that were never
-- enforced. Key limits (keys.*_limit_*) and workspace budgets (workspace_budgets) are the
-- enforced limits, and spend rules (workspace_spend_rules) alert on them; none of these read
-- the guardrail columns. No view, function, trigger, index, policy or constraint references
-- them, so dropping them needs no other change.
--
-- Every value was 0 when this was written (one guardrail on production). The check below stops
-- the migration, and so the deploy, if a non-zero value has appeared since; nothing is dropped
-- then, and the values can be looked at first.

SET local check_function_bodies = off;

DO $$
DECLARE
  v_set integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_guardrails' AND column_name = 'daily_limit_requests'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.workspace_guardrails
      WHERE daily_limit_requests <> 0 OR weekly_limit_requests <> 0 OR monthly_limit_requests <> 0
        OR daily_limit_cost_nanos <> 0 OR weekly_limit_cost_nanos <> 0 OR monthly_limit_cost_nanos <> 0'
      INTO v_set;
    IF v_set > 0 THEN
      RAISE EXCEPTION 'guardrail_budget_values_present: % guardrail(s) hold non-zero budget values; not dropping', v_set;
    END IF;
  END IF;
END $$;

ALTER TABLE public.workspace_guardrails
  DROP COLUMN IF EXISTS daily_limit_requests,
  DROP COLUMN IF EXISTS weekly_limit_requests,
  DROP COLUMN IF EXISTS monthly_limit_requests,
  DROP COLUMN IF EXISTS daily_limit_cost_nanos,
  DROP COLUMN IF EXISTS weekly_limit_cost_nanos,
  DROP COLUMN IF EXISTS monthly_limit_cost_nanos;
