SET LOCAL lock_timeout = '10s';

-- Describes what department budgets now gate. Locks only workspace_department_budgets
-- (SHARE UPDATE EXCLUSIVE: reads and writes continue).
COMMENT ON TABLE "public"."workspace_department_budgets" IS 'Department spend budgets. A department''s spend is what its linked API keys cost, plus the keys and OAuth requests of its members when the key is not linked to a department. Budgets block the department''s requests, batch and video holds and realtime sessions once its spend reaches 100% (gateway_department_budget_status) and send alerts at about 80% and 100% (sweep_department_budget_alerts).';
