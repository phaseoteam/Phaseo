---
"@phaseo/cli": minor
---

Add dedicated `phaseo` commands for the remaining `/v1` management routes: `byok`, `budgets`, `department-budgets`, `spend-rules`, `spend-blocks`, `rate-limits`, `observability`, `notifications`, `routing dynamic-routes`, `private-models`, `classifiers`, `identity`, `workload-identity`, `audit-events`, `apps`, `feedback`, `preset-test-runs`, plus preset versions, labels, fork, upstream and publisher, and workspace invites, join requests and member roles. Secrets come from stdin or the environment, never argv. Destructive commands ask for confirmation or need `--yes`.
