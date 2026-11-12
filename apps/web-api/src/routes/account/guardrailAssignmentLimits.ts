// Generated from packages/shared/guardrail-assignment-limits/index.ts by scripts/sync-guardrail-shared.mjs. Do not edit.
// Limits on one guardrail assignment change (PATCH /api/account/settings/guardrails/assignments).
// They keep the `in` filters well inside PostgREST's URL limit and bound one change to a few
// thousand rows. The settings page splits a larger selection into changes of this size.

export const MAX_ASSIGNMENT_TARGETS = 200;
export const MAX_ASSIGNMENT_GUARDRAILS = 25;
