-- phaseo:allow-destructive-migration reason: drops the six unenforced guardrail budget columns (daily/weekly/monthly request and cost limits) on workspace_guardrails. Nothing reads them: the gateway policy lookup never selected them, they have been hidden in the UI since #2866 and deprecated in the API since #2888, and this change removes the last writers (web editor, settings-guardrails, control guardrails API). Clients that still send them are ignored, not rejected.
--
-- Drop the deprecated guardrail budget fields.
--
-- workspace_guardrails carried daily/weekly/monthly request and cost limits that were never
-- enforced. Key limits (keys.*_limit_*) and workspace budgets (workspace_budgets) are the
-- enforced limits, and spend rules (workspace_spend_rules) alert on them; none of these read
-- the guardrail columns. No view, function, trigger, index, policy or constraint references
-- them, so dropping them needs no other change.

SET local check_function_bodies = off;

ALTER TABLE public.workspace_guardrails
  DROP COLUMN IF EXISTS daily_limit_requests,
  DROP COLUMN IF EXISTS weekly_limit_requests,
  DROP COLUMN IF EXISTS monthly_limit_requests,
  DROP COLUMN IF EXISTS daily_limit_cost_nanos,
  DROP COLUMN IF EXISTS weekly_limit_cost_nanos,
  DROP COLUMN IF EXISTS monthly_limit_cost_nanos;
