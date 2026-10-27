/**
 * Deprecated. Guardrails do not enforce request or spend limits; use API key limits or workspace budgets instead.
 */
export interface GuardrailBudgetInput {
  dailyCostNanos?: number | null;
  dailyRequests?: number | null;
  monthlyCostNanos?: number | null;
  monthlyRequests?: number | null;
  weeklyCostNanos?: number | null;
  weeklyRequests?: number | null;
}
