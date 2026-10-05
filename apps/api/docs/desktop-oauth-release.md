# Desktop OAuth release

Released with explicit production authorization on 5 October 2026.

The public client `phaseo_desktop` is registered in Phaseo Prod (`xansbgjaduxypzsmjwct`) with an IPv4 loopback callback template, identity scopes, `gateway:access` and `models:read`. Existing PKCE, workspace consent, grant revocation and managed-key issuance remain in place. The managed-key flow expires after seven days; it does not issue a refresh token.

Gateway release `1853d68e-571b-4444-9c10-6db5282123e1` was deployed from commit `cf12ad64f`, based on the latest main checkout. Source review is tracked in PR #2718. The previous production version was `dd7ed81b-3160-4667-bccc-60a647ae7a93`.

Validation: 75 OAuth tests, gateway typecheck, scoped lint, dry-run build and the idempotent SQL fixture passed. Production readback confirmed the active public client and exact restricted scopes. A valid authorization request returned 302 to `https://phaseo.app/oauth/consent`, preserving the desktop client, callback and state. Remote callbacks, incorrect paths and query-bearing callbacks returned 401; missing PKCE returned 400. Verification issued no credentials and made no inference calls. Actual user consent and authenticated model discovery still need to be completed from the desktop app.

Rollback: restore the previous Worker version and suspend the desktop client to prevent new grants. Existing issued grants must be revoked through the established authorization flow. The registration is additive and rerunning its insert preserves existing client status; do not delete grant or billing records.
