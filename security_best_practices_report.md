# Security audit report — 16 July 2026

## Executive summary

The audit reviewed the 17 open Codex Security dashboard findings, the current application and SDK code, GitHub code-scanning and Dependabot alerts, CI permissions and action pinning, tracked build artifacts, and the linked production Supabase security advisor.

Five OAuth/CLI findings were already remediated on `main` and have now been closed in the dashboard as already fixed. This branch remediates the other five previously open actionable medium findings, the newly reported merge-queue secret-exposure and passkey-authorization findings, the actionable high/medium GitHub code-scanning findings, all currently fixable dependency alerts identified during the audit, and two additional live database authorization issues. The five Codex informational findings are availability or catalog-data observations rather than security vulnerabilities.

No open GitHub secret-scanning alerts were present. This review does not prove the absence of vulnerabilities; it records the tested controls and the residual risks below.

## Codex Security dashboard findings

| Severity | Finding | Current status |
| --- | --- | --- |
| High | Merge-queue preview deploy exposes Vercel secrets to PR code | Fixed here. Merge-queue commits still run ordinary validation, but the Vercel-token job is limited to manual dispatches and trusted same-repository pull requests. A CI regression validator rejects reintroduction. |
| High | Third-party OAuth keys bypass gateway scope | Already fixed on `main`: delegated spend keys require `gateway:access`, and third-party device flow is disabled. |
| High | Identity-only OAuth grants mint spend keys | Already fixed by the same authorization and token-exchange enforcement. |
| Medium | Generation lookup exposes raw R2 I/O logs | Fixed here. Raw input/output and replay data now require an internal caller or explicit `generations:read`/`activity:read`. |
| Medium | OAuth refresh rotation can deadlock during member removal | Already fixed on `main` by consistent refresh/revocation lock ordering. |
| Medium | Raycast extension legacy URL rewrite | Already fixed on `main`; the legacy host is rewritten before the authorization header is attached. |
| Medium | Webhook validation misses IPv4-mapped IPv6 | Fixed here for mapped, compatible, canonical hexadecimal, and NAT64 representations, including DNS answers. |
| Medium | Rebrand drops legacy key-cache invalidation | Already fixed on `main` with legacy binding support and immediate local invalidation. |
| Medium | Meta `web_search_options` injects arbitrary tools | Fixed here with an allowlist and server-owned tool/location types. |
| Medium | SpaceXAI BYOK migration can delete the active legacy key | Fixed for existing and fresh environments. The original applied migration remains immutable; a new locked, idempotent corrective migration ranks active/always-use keys before provider spelling and then normalizes the keeper. A read-only production check found no SpaceXAI/xAI BYOK rows requiring recovery. |
| Medium | API-model route exposes hidden model metadata | Fixed here by applying hidden-model visibility checks after provider/API-model resolution. |
| Low | Passkey management no longer checks the administrator role | Fixed here. The server-rendered account page exposes passkey management only when the viewer is an administrator and the rollout flag is enabled, and post-ceremony passkey sign-in enforces the same server-side policy before retaining the session. All four authorization combinations are covered by tests. |
| Informational | Tinker and Baseten pricing mismatches, OpenAI Pro-mode metadata, pricing expiry placement, and provider discovery errors | Reviewed; these are catalog/availability correctness findings and do not create a security boundary bypass. |

## Additional security remediations

### Application and SDK code

- Removed browser persistence of Phaseo and OpenAI API keys from saved latency-test configurations and actively strips credentials written by earlier versions.
- Restricted iframe previews to absolute HTTP(S), removed same-origin sandbox privilege, and disabled referrer forwarding.
- Replaced modulo-biased key and PKCE random selection with unbiased generation.
- Corrected POSIX single-quote escaping in generated shell commands.
- Redacted credential-shaped request/response fields before Python devtools telemetry reaches disk and applies owner-only file modes where supported.
- Removed OAuth E2E result details from stdout; detailed results remain in the sanitized report.
- Removed exception messages and stack fields from gateway and route responses, including debug mode and pricing cron results.
- Restored server-side administrator authorization for passkey management and post-ceremony sign-in in addition to the rollout flag.
- Rejected prototype-pollution path segments in both pricing simulator implementations.
- Replaced backtracking OpenAPI path-template parsing with a linear scanner and escaped generated literals/parameter keys across C++, C#, Go, Java, PHP, Python, Ruby, Rust, and TypeScript backends.

### Dependencies, CI, and repository contents

- Updated vulnerable Hono, Undici, Vite, form-data, DOMPurify, OpenTelemetry, protobufjs, js-yaml, ECharts, tar, Next/PostCSS, Guzzle/PSR-7, Jackson Databind, and scanner dependencies.
- Pinned the remaining floating GitHub Actions references to full commit SHAs.
- Reduced publish and stale-workflow token permissions; CodeQL's `security-events: write` remains because uploading CodeQL results requires it.
- Kept `merge_group` validation for the merge queue while excluding it from the Vercel preview job that receives deployment credentials. The preview job continues to require a same-repository pull request and a trusted author association, and a repository validator now enforces those boundaries in CI.
- Removed tracked compiler outputs, Python bytecode, Rust targets, C++ executables, Java/C# build directories, and the committed PHP `vendor` tree; ignore rules now prevent reintroduction.

### Database authorization

The new hardening migration:

- removes the obsolete `WITH CHECK (true)` join-request policy, which otherwise ORed with and bypassed the constrained invite policy;
- recreates the insert policy with user, invite, membership, and state checks;
- revokes PUBLIC/anonymous access to all reviewed `SECURITY DEFINER` functions;
- limits internal gateway, wallet, Stripe, maintenance, and trigger functions to `service_role`;
- retains authenticated access only for RPCs that validate `auth.uid()` and are required by workspace UI/RLS flows;
- pins mutable public-function search paths to non-user-writable schemas; and
- revokes PUBLIC function execution in future `postgres` default privileges.

A second guarded migration moves `pg_net` out of the `public` extension catalog namespace. Because the installed `pg_net` version is not relocatable, the migration takes exclusive locks on its request and response tables, refuses to run if either contains pending work, and then recreates the extension with `extensions` as its catalog namespace. The extension's `net` API schema and the existing signup function remain intact.

Both migrations were executed against the linked production schema inside explicit transactions followed by `ROLLBACK`. Parsing and object/signature resolution succeeded; the `pg_net` test confirmed the new catalog namespace and the continued presence of `enqueue_welcome_email()` and `net.http_post(...)`. Production state was not changed.

## Residual risks and follow-up

1. **Leaked-password protection is an operator action.** The repository cannot enable Supabase's hosted HaveIBeenPwned check through SQL; the owner will enable it in Auth settings. See <https://supabase.com/docs/guides/auth/password-security>.
2. **Authenticated `SECURITY DEFINER` advisories will remain for the explicit allowlist.** Those functions are intentionally callable and perform `auth.uid()`/workspace checks. They should continue receiving targeted authorization tests.
3. **The repository has an accepted single-maintainer review exception.** Main still requires PRs and status checks through an active ruleset. A mandatory non-author approval is not feasible while there is only one maintainer, so that governance setting was intentionally left unchanged.
4. **Webhook DNS rebinding remains a bounded defense-in-depth concern.** Delivery requires HTTPS, rejects private/local literals and private DNS answers immediately before use, disallows redirects, and runs in a Worker with no VPC/private-network binding. Cloudflare's `global_fetch_strictly_public` flag only controls same-zone routing and `resolveOverride` cannot pin arbitrary third-party origins. Fully eliminating the remaining DNS time-of-check/time-of-use window would require a managed egress policy or an outbound proxy that pins the validated destination; adding a VPC binding without such a deny policy would increase rather than reduce exposure.
5. The dashboard now shows 12 open findings. Seven have verified fixes only in this branch and remain open until merge and scanner confirmation; the other five are informational catalog/availability observations. Five findings whose fixes are already on `main` were closed as already fixed during this review.
6. **Linked Supabase migration history needs reconciliation before deployment.** A linked dry run reports 17 older local migration files missing from the remote history table and refuses the normal push. Do not use `--include-all` blindly; reconcile which migrations are already represented in production, repair history deliberately, then apply the three new security migrations.

## Validation performed

- API security regression suite: 49 tests passed.
- Targeted webhook URL and delivery regression suite: 12 tests passed.
- Web security regression suite: 5 tests passed.
- Passkey authorization regression suite: 4 tests passed.
- Full web regression suite: 80 suites and 346 tests passed.
- CI secret-boundary regression suite: 2 tests passed, and the live workflow validation passed.
- Python devtools tests: 9 passed.
- API and web TypeScript checks passed (web after Next route type generation).
- The production web build passed with the restored passkey gate.
- API Worker dry-run build passed and confirmed both OAuth rate-limit bindings.
- OpenAPI core and all nine backend packages built; the new adversarial path parser tests passed.
- Java Maven tests passed with Jackson 2.22.1.
- PHP Composer install, audit, and 22 lifecycle suites passed; Composer reported no advisories.
- Both Next.js OAuth/chat examples installed with zero npm audit findings and built successfully.
- Devtools viewer production build passed on the patched Vite version.
- Root and isolated scanner frozen-lock installs passed.
- The guarded `pg_net` relocation passed against the linked production schema inside `BEGIN`/`ROLLBACK`; production remained on its original extension namespace with empty request/response queues after the test.
- A linked Supabase dry run discovered the pre-existing migration-history gap described above; no migration was applied.
- Targeted ESLint completed with no errors; existing warnings remain.
- `git diff --check` passed.

Two pre-existing OpenAPI package tests remain red independently of these changes: the package test command still uses Node's removed `--loader tsx` form, and when invoked manually one legacy stable-file-set assertion does not match the generator's current output. The modified OpenAPI packages themselves compile successfully and the new security parser tests pass.
