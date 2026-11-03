# Better Auth migration notes (apps/web)

This is the work list for moving the web app's sign-in from Supabase Auth to Better Auth. It follows `database/planetscale/README.md` ("Identity model"), and the cutover order is in `database/planetscale/CUTOVER.md`.

Written against better-auth 1.7.13 on 2026-11-03.

## What exists

| File | Role |
|---|---|
| `options.ts` | The whole configuration: plugins (admin, bearer, jwt, twoFactor, passkey, sso), the `auth` schema mapping, email, hooks |
| `server.ts` | `getAuth()`, the lazy Next instance (`nextCookies()` last). Server code calls `getAuth().api.*` |
| `client.ts` | `authClient`, plus `signIn`, `signUp`, `signOut`, `useSession` and `getSession` for client components |
| `app/api/auth/[...all]/route.ts` | Mounts every Better Auth endpoint under `/api/auth` (Node runtime, never cached) |
| `aal.ts` | Supabase's aal1/aal2 on `auth.sessions.aal`. `needsSecondFactor()` replaces "verified factor and aal1" checks |
| `password.ts` | Verifies Supabase bcrypt hashes. New hashes use scrypt, and a bcrypt hash is rehashed with scrypt on the first password sign-in |
| `signup.ts` | `databaseHooks.user.create.after`: `public.users` row plus the optional Discord message (see "Sign-up") |
| `origins.ts`, `email.ts`, `database.ts`, `schema-map.ts`, `auth.cli.ts` | Base URL and trusted origins, Resend mail, `pg` pool, column map, CLI entry point |
| `database/planetscale/scripts/import-supabase-users.ts` | Copies users, password hashes, OAuth links and passkeys from Supabase (see "Importing users") |

`@/lib/db/session` (the proxy's session lookup) already switches on `AUTH_PROVIDER=better-auth`. Every other call site below still calls Supabase.

## API map

Server code means server components, server actions and route handlers: `const auth = getAuth(); const h = await headers();`. Client code means `authClient` from `client.ts`.

| Supabase | Better Auth |
|---|---|
| `auth.getUser()` (server) | `auth.api.getSession({ headers: h })` returns `{ user, session } \| null`. It reads a 5-minute signed cookie cache. Before anything sensitive (deleting the account, billing, changing MFA), pass `query: { disableCookieCache: true }` so a revoked session or a ban takes effect at once |
| `auth.getSession()` → `session.access_token`, sent as `Bearer` to web-api, the gateway or `/api/account/*` | Client: `authClient.token()` → `{ token }`, a 15-minute JWT (EdDSA, issuer `BETTER_AUTH_URL`, audience `phaseo`, claims `sub`, `sid`, `aal`, `email`, `two_factor_enabled`, `mfa_reenrollment_required`). Server: `auth.api.getToken({ headers: h })`. Same-origin `/api/account/*` routes can read the cookie session instead and skip the token |
| `auth.getClaims()` → `amr` and "recent sign-in" | `session.createdAt` (a new session is created at every sign-in), or `auth.api.verifyPassword({ body: { password }, headers: h })` for a step-up |
| `auth.mfa.getAuthenticatorAssuranceLevel()` / `mfa.listFactors()` | `session.aal`, `user.twoFactorEnabled` and `user.mfaReenrollmentRequired`, combined by `needsSecondFactor()` in `aal.ts` |
| `auth.signInWithPassword` | `auth.api.signInEmail({ body: { email, password, callbackURL } })`. If the user has TOTP on, the response is `twoFactorRedirect: true` and there is no session yet |
| `auth.signInWithOAuth({ provider, options: { redirectTo } })` | `auth.api.signInSocial({ body: { provider, callbackURL, errorCallbackURL } })` returns `{ url }`; then `redirect(url)`. Its state cookie is set through `nextCookies()` |
| `auth.signInWithSSO({ domain \| providerId })` | `auth.api.signInSSO({ body: { domain \| providerId, callbackURL } })` |
| `auth.signInWithPasskey()` | `authClient.signIn.passkey()` |
| `auth.exchangeCodeForSession(code)` | Not needed. Better Auth completes OAuth, SSO and email links under `/api/auth/*`, then redirects to the `callbackURL` |
| `auth.signUp({ email, password, options: { emailRedirectTo } })` | `auth.api.signUpEmail({ body: { email, password, name, callbackURL } })`. The verification email goes out because `requireEmailVerification` is on |
| `auth.resetPasswordForEmail(email, { redirectTo })` | `auth.api.requestPasswordReset({ body: { email, redirectTo } })`. The link arrives as `redirectTo?token=…` |
| `onAuthStateChange('PASSWORD_RECOVERY')` + `updateUser({ password })` | Read `token` from the URL, then `authClient.resetPassword({ newPassword, token })`. Other sessions are revoked (`revokeSessionsOnPasswordReset`) |
| `updateUser({ password })` after re-entering the old one | `auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: h })`. For OAuth-only users, use server-only `auth.api.setPassword` |
| `updateUser({ email })` | `auth.api.changeEmail({ body: { newEmail, callbackURL }, headers: h })`. A confirmation goes to the current address |
| `mfa.enroll` / `mfa.challenge` / `mfa.verify` (enrolling) | `auth.api.enableTwoFactor({ body: { password? }, headers: h })` → `{ totpURI, backupCodes }`, then `verifyTOTP({ body: { code } })`. Password is optional because `allowPasswordless` is on |
| `mfa.challenge` + `mfa.verify` (signing in) | `authClient.twoFactor.verifyTotp({ code })` or `verifyBackupCode({ code })`. Inside an existing session it raises that session to aal2 (`options.ts` hooks) |
| `mfa.unenroll` | `auth.api.disableTwoFactor({ body: { password? }, headers: h })` |
| `auth.passkey.startRegistration` + `verifyRegistration` | `authClient.passkey.addPasskey({ name })`, which runs both steps through @simplewebauthn/browser |
| `auth.passkey.list` / `auth.passkey.delete` | `authClient.passkey.listUserPasskeys()` / `authClient.passkey.deletePasskey({ id })` |
| `auth.signOut()` | `authClient.signOut()` (client) or `auth.api.signOut({ headers: h })` |
| `auth.admin.getUserById(id)` (server, no session) | `(await auth.$context).internalAdapter.findUserById(id)`, or a plain `select … from auth.users`. The admin plugin's `getUser` needs an admin session |
| `auth.admin.deleteUser(id)` | `(await auth.$context).internalAdapter.deleteUser(id)` after Phaseo's own step-up. Sessions, accounts and passkeys cascade. The 79 foreign keys to `auth.users` behave as on Supabase |
| `supabase.auth.oauth.*` (Supabase's OAuth 2.1 server) | No direct equivalent; see "OAuth servers" |

## Call sites in apps/web/src

Found by grepping for `.auth.` (tests excluded). Group them into PRs by flow rather than by file.

### Sign-in, sign-up and callbacks

| File | Today | Under Better Auth |
|---|---|---|
| `app/[locale]/(auth)/sign-in/actions.ts` | `handleOAuthRedirect`: `signInWithOAuth`. `handlePasswordSignIn`: `signInWithPassword`, then `finalizePostLogin`. `completePasskeySignIn`: `getUser` + `getSession`, then `finalizePostLogin`. `startSsoSignIn` / `handleEnterpriseSsoRedirect`: `signInWithSSO`, or `signInWithOAuth` with `custom:<id>` (`lib/auth/sso.ts`). `forgotPasswordAction`: `resetPasswordForEmail` | `signInSocial` with `callbackURL` = `/auth/callback?returnUrl=…`, so `finalizePostLogin` still runs. `signInEmail`, and on `twoFactorRedirect` send people to `/auth/verify-mfa`. Passkey: `getSession`. `signInSSO`, where the custom provider id becomes the SSO `providerId`. `requestPasswordReset` |
| `app/[locale]/(auth)/sign-up/actions.ts` | `signInWithOAuth`. `signUp` with `emailRedirectTo` | `signInSocial` (as above). `signUpEmail` with `callbackURL` = `/auth/callback` |
| `app/auth/callback/route.ts` | `exchangeCodeForSession(code)`, then `getUser` + `getSession`, then `finalizePostLogin`. Also handles the `type=recovery` / `type=signup` links | Drop the exchange. Better Auth has already set the session cookie when it redirects here. `getSession({ headers, query: { disableCookieCache: true } })`, then `finalizePostLogin`. Better Auth reports errors as `?error=` on `errorCallbackURL` |
| `lib/auth/post-login.ts` (`finalizePostLogin`) | `getUser`, `mfa.listFactors` + AAL: a verified TOTP and aal1 means go to `/auth/verify-mfa`. `getSession` for `ssoProviderIdFromSession`. Provisions the workspace and links SCIM | `needsSecondFactor({ twoFactorEnabled, mfaReenrollmentRequired, aal })`. Get the SSO provider from the user's `auth.accounts` row whose `provider_id` is the SSO provider id, not from JWT `amr`. Display name: `user.name`, then `userMetadata.full_name` |
| `components/(gateway)/auth/PasskeySignInButton.tsx` | `signInWithPasskey()`, then AAL: if aal2 is needed, go to verify-mfa | `authClient.signIn.passkey()`, then `completePasskeySignIn`. A passkey session is aal1, as on Supabase |
| `components/(gateway)/auth/Login.tsx` | Renders the passkey button and providers | Only the copy changes, if any |
| `app/[locale]/(auth)/auth/reset-password/page.tsx` | Waits for `PASSWORD_RECOVERY` from `onAuthStateChange`, then `updateUser({ password })` | Read `?token=`; `authClient.resetPassword({ newPassword, token })`. `?error=INVALID_TOKEN` means the link expired |
| `app/[locale]/(auth)/auth/verify-mfa/actions.ts` + `page.tsx` | `getUser`, `mfa.listFactors`, `challenge`, `verify`. The page's cancel is `signOut` | `authClient.twoFactor.verifyTotp`, or the backup code. **If `user.mfaReenrollmentRequired`, show enrolment** (`enableTwoFactor`, then `verifyTOTP`) instead of a code prompt, otherwise the imported MFA user is locked out. `authClient.signOut()` |
| `app/[locale]/(auth)/activate/page.tsx` + `actions.ts` | Device activation: `getUser`/`getSession`, AAL check, then `Bearer access_token` to `${api}/oauth/device/activate` | `getSession`, `needsSecondFactor`, then `Bearer` from `auth.api.getToken({ headers })`. The API reads it with `AUTH_PROVIDER=better-auth` (see "OAuth servers") |
| `app/[locale]/(auth)/oauth/consent/page.tsx` + `actions.ts` | Two flows. With `authorization_id`: Supabase's own OAuth server (`supabase.auth.oauth.getAuthorizationDetails` / approve / deny). Without it: Phaseo's apps/api server, approved via `Bearer access_token` to `${api}/oauth/authorize/approve`. Both use `getUser`, AAL and `getSession` | Phaseo flow: `getSession`, `needsSecondFactor`, `getToken`. Supabase flow: see "OAuth servers" |
| `proxy.ts` → `utils/supabase/middleware.ts` → `lib/db/session.ts` | Session refresh and auth gates for every request | Already switched by `AUTH_PROVIDER`; the other agent owns these. Better Auth refreshes the cookie itself (`updateAge` 1 day), so the proxy only reads |

### Session reads and access tokens

| File | Today | Under Better Auth |
|---|---|---|
| `utils/serverActionAuth.ts` (`requireAuthenticatedUser`) | `getUser()` for every server action that requires sign-in | `getSession({ headers })`; return `session.user`. This one change covers most server actions |
| `lib/server/activeTeamStripe.ts` | `getUser()` before billing admin checks | `getSession` with `disableCookieCache` (billing) |
| `app/api/credits/topups/[id]/{checkout,confirm,decline}/route.ts`, `app/api/stripe/invoices/document/route.ts` | `getUser()` | `getSession({ headers: request.headers, query: { disableCookieCache: true } })` |
| `app/[locale]/(dashboard)/settings/credits/topups/[id]/page.tsx` | `getUser()`, then `admin.auth.admin.getUserById` for the requester's email | `getSession`, then `internalAdapter.findUserById` |
| `app/api/webhooks/stripe-checkout/route.ts` | `admin.auth.admin.getUserById(owner_user_id)` for the receipt email | `internalAdapter.findUserById`, or `select email from auth.users` |
| `app/[locale]/(dashboard)/actions.ts` | `getSession()` → `access_token` to web-api | `auth.api.getToken({ headers })` |
| `lib/fetchers/internal/{fetchCreditsTierSummary,fetchInternalAuthHeaderData,fetchInternalAuthStatus,serverAccountContext}.ts` | Server: `getSession()` → `access_token` → `fetchAccountWebApi` | `getToken`. `serverAccountContext` keeps its `accessToken` field |
| `lib/fetchers/internal/accountAuthClient.ts` | Client: `getSession()` → `access_token` (shared helper) | `(await authClient.token()).data?.token ?? null`. Cache it until ~1 minute before `exp`, because each call is a round trip |
| `lib/query/fetchPrivateUsage.ts`, `components/(chat)/use-chat-credits.ts`, `components/(chat)/ChatLogImportDialog.tsx`, `components/(gateway)/settings/PrivateSettingsQuery.tsx` | Client: `getSession()` → `access_token` | Through `accountAuthClient.ts`, not their own calls |
| `components/(chat)/playground/use-chat-auth.ts` | `onAuthStateChange('SIGNED_OUT')`, `signOut()` | `authClient.useSession()` (null means signed out), `authClient.signOut()` |
| `lib/fetchers/internal/postClientAuthSignOut.ts` | `signOut()` | `authClient.signOut()` |

### Account settings

| File | Today | Under Better Auth |
|---|---|---|
| `app/[locale]/(dashboard)/settings/account/actions.ts` | Step-up (`requireSensitiveAccountStepUp`): `getClaims` "recent sign-in", AAL, or re-entering the password with a throwaway `signInWithPassword` client. `userHasPassword` from `app_metadata.provider`. `updateAccount`: `getUser`. `changePasswordAction`: `signInWithPassword` + `updateUser({ password })`. `changeEmailAction`: same + `updateUser({ email })`. `enrollMFAAction` / `verifyMFAEnrollmentAction` / `unenrollMFAAction` / `cleanupUnverifiedMFAAction`: `mfa.*`. Passkey actions: `passkey.startRegistration` / `verifyRegistration` / `delete`. `deleteAccount`: step-up + `admin.deleteUser` | Step-up: `session.createdAt` within the window, `needsSecondFactor`, or `auth.api.verifyPassword` (checks without creating a session). `userHasPassword`: `listUserAccounts` includes `providerId === "credential"`. `changePassword`, `changeEmail`, `enableTwoFactor` / `verifyTOTP` / `disableTwoFactor`. `cleanupUnverifiedMFA` has nothing to do: the next `enable` overwrites the user's existing `two_factors` row. Passkeys: client `authClient.passkey.*`, with the step-up server action run first. `deleteAccount`: keep the step-up, then `internalAdapter.deleteUser` |
| `components/(gateway)/settings/account/PasskeyManager.tsx` | `passkey.list()`, `signOut()` | `authClient.passkey.listUserPasskeys()`, `authClient.signOut()` |
| `components/(gateway)/settings/account/AccountMFAClient.tsx` | UI for the MFA actions (QR from the enrol response) | The QR comes from `totpURI`. Show the backup codes once (new; Supabase had none) |
| `lib/auth/passkeyWebAuthn.ts` (+ test) | Base64url ⇄ `ArrayBuffer` for Supabase's raw WebAuthn JSON | Delete once the passkey client replaces it |
| `app/[locale]/(dashboard)/settings/account/actions.passkeys.test.ts` | Mocks `supabase.auth.passkey` | Rewrite against the new actions |

### Outside apps/web (other owners; listed so nothing is missed)

- **`apps/mobile/src/providers/AuthProvider.tsx`** calls `getSession`, `mfa.*`, `onAuthStateChange`, `startAutoRefresh`, `exchangeCodeForSession` and `signInWithOAuth` with `skipBrowserRedirect`. Better Auth's Expo integration (`@better-auth/expo`, server plugin `expo()` plus `expoClient` with SecureStore) is the usual route; it is not in `apps/web/package.json` yet. `origins.ts` already trusts `phaseo://` and `phaseo-perf://`.
- **`apps/desktop/src/main/phaseoLogin.ts`** talks to GoTrue directly: `/auth/v1/authorize?provider=…&redirect_to=http://127.0.0.1:<port>/callback` with PKCE, `/token?grant_type=pkce|password|refresh_token`. See "Desktop".
- **`apps/api`, `apps/web-api`** verify the JWT. `@phaseo/db/jwt` (`verifyBetterAuthJwt`) expects exactly what `options.ts` issues: JWKS at `<BETTER_AUTH_URL>/api/auth/jwks`, issuer `BETTER_AUTH_URL`, audience `phaseo`, and `sid` for the session row. `readBetterAuthIdentity` then reads `auth.users` and `auth.sessions`, so a sign-out or ban applies before the token expires.

## Sign-up

`public.handle_auth_user_created()` and its trigger `on_auth_user_created_enqueue_welcome` are still in `0002_baseline.sql`. They now only insert `public.users (user_id)`; the Discord webhook was removed with pg_net. The trigger fires inside Better Auth's user insert, so `public.users` is created atomically with the user, as on Supabase. `signup.ts` inserts the same row again after commit (`on conflict do nothing`), so both run. Keep the hook as a safety net, or drop its insert and keep only the Discord message.

- The welcome email isn't sent by the database or by Better Auth: `finalizePostLogin` sends it through a Resend Automation.
- Set `DISCORD_AUTH_SIGNUP_WEBHOOK_URL` only if you want a second Discord message alongside the one `finalizePostLogin` sends.
- The Supabase import disables the trigger while it runs, so imported users don't get default `public.users` rows (see the script's header).

## MFA

- **TOTP cannot be carried over.** Supabase's TOTP secrets can't be copied out, so the import sets `auth.users.mfa_reenrollment_required` for every user with a verified factor (1 on prod).
- **Enforcement.** `needsSecondFactor()`, the JWT and `apps/api` all treat the flag like "MFA required, not verified", and it clears when the user enables TOTP again (`databaseHooks.user.update.before`).
- **`/auth/verify-mfa` must offer enrolment when the flag is set.** Otherwise that user can't get in.
- **Password + TOTP users.** Better Auth holds the session until the code is checked, and the session it then creates is aal2.
- **Social, passkey and SSO users with TOTP.** They get an aal1 session, and the proxy sends them to `/auth/verify-mfa`; the verify raises the session to aal2. That is the same behaviour as on Supabase.

## Passkeys

- **Today.** The repo uses Supabase's experimental passkey API (`auth: { experimental: { passkey: true } }` in `utils/supabase/{client,server}.ts`; `auth.passkey.*`; `signInWithPasskey`). Supabase stores credentials in `auth.webauthn_credentials` as raw `credential_id`/`public_key` bytea, with a COSE key. Prod has **1 passkey (1 user)**, and its RP ID was `phaseo.app` (`auth.webauthn_challenges.session_data.rpId`). `auth.mfa_factors` has no WebAuthn factors.
- **Ported, not re-registered.** A WebAuthn credential is bound to the RP ID, not to Supabase. The import writes it to `auth.passkeys` (credential id as base64url, COSE key as base64, `sign_count` → `counter`, `backup_eligible` → `multiDevice`). The import test proves an assertion signed for an imported key is accepted by `/api/auth/passkey/verify-authentication`.
- **Set `PASSKEY_RP_ID=phaseo.app`** in production. Origin is `BETTER_AUTH_URL`, `https://phaseo.app`.
- **Previews** use their own host as RP ID, so production passkeys won't work there, as before.

## OAuth providers: redirect URIs

Better Auth's callback is `<base URL>/api/auth/callback/<provider>`. Register:

| Provider | Production | Local |
|---|---|---|
| Google (OAuth client, Web) | `https://phaseo.app/api/auth/callback/google` | `http://localhost:3100/api/auth/callback/google` |
| GitHub (OAuth app) | `https://phaseo.app/api/auth/callback/github` | A separate dev OAuth app: an OAuth app takes one callback URL, and the host must match |
| GitLab (gitlab.com application; Better Auth requests scope `read_user`) | `https://phaseo.app/api/auth/callback/gitlab` | `http://localhost:3100/api/auth/callback/gitlab` |

- **Previews.** Vercel preview hosts change per deployment, and Google and GitHub don't take wildcard redirect URIs. Social sign-in on previews needs Better Auth's `oAuthProxy` plugin (redirecting through production), or password, passkey and SSO only. That is an open decision; `options.ts` doesn't include `oAuthProxy`.
- **Existing links keep working.** The import keys accounts by the provider's own id, the same key Better Auth looks up first: Google `sub`, GitHub and GitLab numeric user id. The test checks `findAccountOwnerByKey` for each provider.
- **Account linking** by verified email stays on for the three providers (`accountLinking.trustedProviders`), as Supabase did it.

## OAuth servers

1. **Phaseo's own OAuth server (`apps/api/src/lib/oauth`).** It issues Phaseo gateway tokens to apps (device flow `/oauth/device/activate`, authorise and approve, PKCE, CIMD clients, MCP scopes). Its tokens are minted and checked by `apps/api` with its own keys (`jwt.ts`, `jwks.ts`), so they don't depend on Supabase.
   - **Today**, the only Supabase part is "who is the person approving": `getSupabaseActor(accessToken)` calls `supabase.auth.getUser`.
   - **Under `AUTH_PROVIDER=better-auth`**, `getBetterAuthActor` verifies the Better Auth JWT from `/api/auth/token`, refuses tokens whose `client_id` isn't first-party, and reads `auth.users` and `auth.sessions`. `mfaRequired` is `two_factor_enabled || mfa_reenrollment_required`, and `assuranceLevel` is `session.aal`.
   - **The web pages** (`activate`, `oauth/consent` without `authorization_id`) only need to send `getToken()` instead of `access_token`.
   - **Still on Supabase:** `fetchUserProfile` (`supabase.auth.admin.getUserById`) needs the same switch, to `auth.users` through `@phaseo/db`.
2. **Supabase Auth's OAuth 2.1 server (`supabase.auth.oauth.*`, consent with `authorization_id`).** It goes away with Supabase Auth. Prod has **13 registered clients (6 not deleted), 6 authorisations and 0 consents**.
   - **Decide first:** move those clients to Phaseo's apps/api server, which already supports dynamic and CIMD clients, or add Better Auth's OAuth provider plugin.
   - **Either way,** the consent page's `authorization_id` branch and the clients' issuer and endpoints change, and their users must re-authorise.

## Desktop

The desktop app signs in through GoTrue with PKCE to a one-time loopback listener. Better Auth has no loopback PKCE endpoint, and `origins.ts` deliberately doesn't trust `http://127.0.0.1:*`: any local process could listen there.

Options:
- **(a) The device flow `apps/api` already has.** It needs no new trust.
- **(b) A web page that signs the user in and hands the loopback a one-time code.** For example `/desktop/sign-in?redirect_uri=http://127.0.0.1:<port>/callback&code_challenge=…`. The page validates the loopback URI itself, issues a Better Auth `oneTimeToken`, and the desktop app exchanges it for a session token, which `bearer()` accepts.
- **Password sign-in** becomes `POST /api/auth/sign-in/email` (the token comes back in `set-auth-token`).
- **Refresh tokens go away.** The session token lasts 30 days, sliding daily, and `/api/auth/token` mints the 15-minute JWT.

## Environment

Full list in `database/planetscale/ENV.md`. Better Auth reads:

| Variable | Where | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | web (Vercel, all envs) | ≥32 random bytes. Signs cookies and encrypts `auth.jwks` private keys and OAuth tokens. Required in production; rotating it invalidates sessions and the JWKS |
| `BETTER_AUTH_URL` | web, plus `apps/api`/`apps/web-api` as the issuer | `https://phaseo.app`. Previews resolve their own host (`origins.ts`) |
| `BETTER_AUTH_GOOGLE_CLIENT_ID` / `_SECRET`, `BETTER_AUTH_GITHUB_…`, `BETTER_AUTH_GITLAB_…` | web | Set both or neither per provider |
| `PASSKEY_RP_ID` | web, production | `phaseo.app` (keeps the imported passkey working) |
| `PLANETSCALE_DATABASE_URL` | web | PgBouncer URL (:6432), app role. `AUTH_DATABASE_POOL_MAX` defaults to 1 |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (or `RESEND_FROM_EMAIL`) | web | Verification, reset and change-email messages |
| `BETTER_AUTH_TRUSTED_ORIGINS` | web, optional | Comma-separated extras |
| `BETTER_AUTH_COOKIE_DOMAIN` | web, optional | Only if a subdomain must read the session cookie |
| `DISCORD_AUTH_SIGNUP_WEBHOOK_URL` | web, optional | See "Sign-up" |
| `AUTH_PROVIDER=better-auth`, `BETTER_AUTH_JWT_ISSUER` / `BETTER_AUTH_JWKS_URL` / `BETTER_AUTH_JWT_AUDIENCE` | Workers | Defaults are derived from `BETTER_AUTH_URL` |
| `PLANETSCALE_DIRECT_URL`, `SUPABASE_DB_URL` | importer only | Direct (:5432) owner role on the target. Read-only access to the source's auth tables |

## Regenerating 0001_auth.sql

`0001_auth.sql` is the CLI's output, adjusted by hand (its header lists what changed). After changing `options.ts`, a plugin or `schema-map.ts`:

1. Start an empty Postgres 17 and run `create schema auth`. The embedded one used by `database/planetscale/scripts/verify-baseline.mjs` works.
2. `cd apps/web && PLANETSCALE_DATABASE_URL=postgres://…/empty pnpm dlx auth@<better-auth version> generate --config src/lib/auth/better-auth/auth.cli.ts --output ../../database/planetscale/migrations/0001_auth.generated.sql --yes`
3. Fold the differences into `0001_auth.sql` by hand, keeping the adjustments; don't commit the generated file.
4. **Drift check:** run the same command against a database with 0000 and 0001 applied. It must print `Your schema is already up to date`. (On 2026-11-03 it did, with better-auth 1.7.13.) Better Auth also validates the schema at startup and logs an error on mismatch.
5. Run the importer test (below). It applies the real 0001 and signs in through Better Auth.

## Importing users

Use `database/planetscale/scripts/import-supabase-users.ts`; its header covers inputs, flags and the trigger choice.

```sh
pnpm --filter @phaseo/web exec tsx ../../database/planetscale/scripts/import-supabase-users.ts --from-supabase --dry-run
pnpm --filter @phaseo/web exec tsx --test ../../database/planetscale/scripts/import-supabase-users.test.ts
```

- **Order.** Run it after 0000 to 0002 and **before** the `public.*` data copy, because `public.users` and the 78 other foreign keys need `auth.users` first.
- **Re-runs.** It is idempotent, and a final re-run just before cutover picks up late sign-ups. It refuses once `auth.sessions` has rows unless `--allow-live` is passed.
- **Prod (2026-11-03):**
  - 183 users and 32 bcrypt password hashes (no other hash types).
  - Identities: google 137, github 15, gitlab 1, email 32.
  - 1 verified TOTP factor and 1 passkey.
  - No users with a null or mixed-case email; none anonymous, banned or soft-deleted; 0 SSO providers.

## Open items

- **Everyone signs in again at cutover.** Supabase sessions (257 unexpired) can't become Better Auth sessions.
- **Auth email copy.** `email.ts` sends plain HTML. Port the Supabase templates, or design new ones, before cutover.
- **Rate limiting behind Vercel.** It keys on `x-vercel-forwarded-for` / `x-real-ip`. Locally neither is set, so Better Auth logs a warning and uses one shared bucket per path. Confirm the header on a preview.
- **Cookie cache.** For up to 5 minutes after sign-out elsewhere, a ban or a revoke, the web app still accepts the cached session. Workers re-read `auth.sessions` on every token check.
- **Social sign-in on previews** (`oAuthProxy` or not), and the **Supabase OAuth 2.1 clients** (see "OAuth servers"); both need a decision.
- **`@better-auth/expo` for mobile and the desktop sign-in flow.** Not built.
- **Backup codes.** TOTP now comes with backup codes (Supabase had none). Decide whether the enrolment UI shows them.
