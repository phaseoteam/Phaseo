# Desktop OAuth release

Released with explicit production authorization on 5 October 2026.

The public client `phaseo_desktop` is registered in Phaseo Prod (`xansbgjaduxypzsmjwct`) with an IPv4 loopback callback template, identity scopes, `gateway:access` and `models:read`. Existing PKCE, workspace consent, grant revocation and managed-key issuance remain in place. The managed-key flow expires after seven days; it does not issue a refresh token.

Gateway release `1853d68e-571b-4444-9c10-6db5282123e1` was deployed from commit `cf12ad64f`, based on the latest main checkout. Source review is tracked in PR #2718. The previous production version was `dd7ed81b-3160-4667-bccc-60a647ae7a93`.

Validation: 75 OAuth tests, gateway typecheck, scoped lint, dry-run build and the idempotent SQL fixture passed. Production readback confirmed the active public client and exact restricted scopes. A valid authorization request returned 302 to `https://phaseo.app/oauth/consent`, preserving the desktop client, callback and state. Remote callbacks, incorrect paths and query-bearing callbacks returned 401; missing PKCE returned 400. Verification issued no credentials and made no inference calls. Actual user consent and authenticated model discovery still need to be completed from the desktop app.

Rollback: restore the previous Worker version and suspend the desktop client to prevent new grants. Existing issued grants must be revoked through the established authorization flow. The registration is additive and rerunning its insert preserves existing client status; do not delete grant or billing records.

## Website consent correction

The initial gateway-only checks missed a second exact-URL comparison on the authenticated website consent page. That comparison rejected the desktop's temporary port, despite the gateway accepting it. Commit `6296080a4` applies the same restricted native callback rule to the consent page and decline action. It retains exact registrations for other clients and requires trusted first-party metadata plus the registered desktop callback template.

All 21 web regression tests passed, including rendering the authenticated consent page, rejecting a remote callback and returning a denial to the desktop callback. Scoped lint passed with existing console warnings; standalone typecheck and production cloud build passed. Local Windows Vercel packaging failed on an unrelated about-page lambda, so the release used Vercel's cloud builder.

Website deployment `dpl_HonrRFNFeVxB4YSzkm8zG5JeDkmk` is Ready and aliased to `phaseo.app`. The preceding deployment was `dpl_CeGrEQJ4wffrzT63pFz8NB9otZ7a`. Users must start a fresh desktop sign-in attempt because the original callback listener may have expired. Actual signed-in consent and credential issuance still require user interaction.
