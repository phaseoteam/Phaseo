# Free-model fee recovery

Included free-model requests do not use the fee journal. Explicitly enabled
overage reserves $0.0001 before dispatch. Successful completed requests capture
the hold; failed, empty and disconnected requests release it. The requesting
workspace pays; allowance and consent belong to the workspace owner.

## Bounds

The existing owner coordinator retains at most 128 unresolved fees. Unknown
outcomes enter review after 15 minutes without guessing a capture or release.
Known outcomes have at most five automatic attempts, at most eight per alarm.
Review-only or idle coordinators have no alarm. At capacity, new overage fails
closed. Review rows are not expired: expiring them could lose financial state.

The journal does not make supplier cancellation or generic token billing
crash-proof. Worker termination before a terminal decision can leave a hold for
review. Provider usage and a successful charge acknowledgement are different
evidence; never infer one from the other.

## Operator procedure

Use the existing private internal token in `x-internal-token`; never put it in a
URL, browser, issue or log. Inference keys and user sessions cannot use these
routes. Both routes are uncached and share a bounded operator rate guard.

1. `GET /internal/free-model-recovery/{ownerId}` lists at most 128 review rows,
   with the immutable workspace/key/server request identity, outcome and attempts.
2. Investigate the matching wallet reservation and credit ledger by workspace
   and `free_model_hold:{requestId}`. The public audit ID is separate. Check the
   trusted `detail_metadata.free_model_fee_request_id` bridge, not only a public
   request ID. Check source availability and root cause before retrying.
3. For a **recorded** capture/release outcome, POST to the same URL plus `/retry`
   with `{ "workspaceId": "...", "requestId": "...", "expectedAttempts": 5 }`.
   This attempts the existing decision once. It cannot change it or create a new
   reservation. Duplicate/stale submissions fail. There is a 32-attempt lifetime
   ceiling, including automatic attempts.
4. If the reply is unknown or conflicting, GET again before any further action.
   No automatic HTTP retries. A settled row disappears; a failed one remains in
   review with an incremented attempt count and no new alarm.
5. A null outcome cannot be retried by this endpoint. Obtain authoritative
   request/provider evidence and an explicitly approved financial reconciliation
   scope. Do not manufacture successful usage, debit a second ID, refund a
   captured fee or silently release a potentially active hold.

## Rollout and rollback

Keep `GATEWAY_FREE_MODEL_OVERAGE_ENABLED` off until the identity migration,
bindings, success/failure tests and operator access are verified for that
environment. Owner consent is still required when the deployment flag is on.
Disabling the flag prevents new overage authorizations; it must not disable
existing settlement, alarms or operator access. Do not delete the coordinator
or journal while outstanding holds or decisions exist.
