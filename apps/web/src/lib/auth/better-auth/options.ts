/**
 * Phaseo's Better Auth configuration, without anything Next-specific, so the CLI config (auth.cli.ts), tests and
 * the Next server instance (server.ts) build the same thing. Written against better-auth 1.7.13 (docs at
 * better-auth.com/docs, read 2026-11-03, plus the published 1.7.13 type definitions).
 */
import { passkey } from "@better-auth/passkey";
import { sso } from "@better-auth/sso";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { admin, bearer, jwt, twoFactor } from "better-auth/plugins";
import { PostgresDialect } from "kysely";
import type { Pool } from "pg";

import { assuranceForNewSession, isTwoFactorVerifyPath, normaliseAssurance } from "./aal";
import { renderAuthEmail, sendAuthEmail } from "./email";
import { canonicalOrigin, isProduction, resolveBaseURL, resolveTrustedOrigins, vercelPreviewHosts } from "./origins";
import { PASSWORD_SIGN_IN_PATH, passwordOptions, upgradeLegacyPasswordHash } from "./password";
import {
	AUTH_SCHEMA,
	accountModel,
	jwksModel,
	passkeyModel,
	rateLimitModel,
	sessionLegacyFields,
	sessionModel,
	sessionPluginFields,
	ssoProviderModel,
	twoFactorModel,
	userLegacyFields,
	userModel,
	userPluginFields,
	verificationModel,
} from "./schema-map";
import { createUserCreatedHook } from "./signup";

type Env = Record<string, string | undefined>;

export type AuthDeps = {
	pool: Pool;
	env?: Env;
	sendEmail?: typeof sendAuthEmail;
	fetchImpl?: typeof fetch;
};

/** Audience of the JWTs the Workers accept (verify-jwt.ts checks it). */
export const PHASEO_JWT_AUDIENCE = "phaseo";
export const JWT_EXPIRATION = "15m";

const SOCIAL_PROVIDERS = ["google", "github", "gitlab"] as const;

function socialCredentials(env: Env, provider: (typeof SOCIAL_PROVIDERS)[number]) {
	const key = provider.toUpperCase();
	const clientId = env[`BETTER_AUTH_${key}_CLIENT_ID`]?.trim();
	const clientSecret = env[`BETTER_AUTH_${key}_CLIENT_SECRET`]?.trim();
	if (!clientId && !clientSecret) return undefined;
	if (!clientId || !clientSecret) {
		throw new Error(`BETTER_AUTH_${key}_CLIENT_ID and BETTER_AUTH_${key}_CLIENT_SECRET must be set together`);
	}
	return { clientId, clientSecret };
}

function requiredSecret(env: Env): string {
	const secret = env.BETTER_AUTH_SECRET?.trim();
	if (secret) return secret;
	if (isProduction(env)) throw new Error("BETTER_AUTH_SECRET is required");
	return "phaseo-local-development-secret-not-for-production";
}

/** The relying party for passkeys: phaseo.app in production, the preview host on previews. */
function passkeyRelyingParty(env: Env): { rpID: string; origin: string } {
	const configured = env.PASSKEY_RP_ID?.trim();
	const previewHost = vercelPreviewHosts(env)[0];
	if (configured) return { rpID: configured, origin: canonicalOrigin(env) };
	if (previewHost) return { rpID: previewHost, origin: `https://${previewHost}` };
	const origin = canonicalOrigin(env);
	return { rpID: new URL(origin).hostname, origin };
}

/**
 * The Better Auth plugins, in order. `tail` is for runtime-specific plugins that must come last (Next's
 * `nextCookies()`); it is typed as a tuple so `auth.api` keeps every plugin endpoint's type.
 */
function phaseoPlugins<const Tail extends BetterAuthPlugin[]>(env: Env, tail: Tail) {
	const issuer = canonicalOrigin(env);
	const relyingParty = passkeyRelyingParty(env);
	const plugins = [
		admin({
			schema: {
				user: {
					fields: {
						role: userPluginFields.role,
						banned: userPluginFields.banned,
						banReason: userPluginFields.banReason,
						banExpires: userPluginFields.banExpires,
					},
				},
				session: { fields: { impersonatedBy: sessionPluginFields.impersonatedBy } },
			},
		}),
		// Mobile, desktop and the CLI send `Authorization: Bearer <session token>`; responses carry `set-auth-token`.
		bearer(),
		jwt({
			jwks: { jwksPath: "/jwks" },
			jwt: {
				issuer,
				audience: PHASEO_JWT_AUDIENCE,
				expirationTime: JWT_EXPIRATION,
				definePayload: ({ user, session }) => ({
					email: user.email,
					email_verified: user.emailVerified,
					sid: session.id,
					aal: normaliseAssurance(session.aal),
					two_factor_enabled: Boolean(user.twoFactorEnabled),
					mfa_reenrollment_required: Boolean(user.mfaReenrollmentRequired),
					role: typeof user.role === "string" ? user.role : "user",
				}),
			},
			schema: { jwks: jwksModel },
		}),
		twoFactor({
			issuer: "Phaseo",
			// Most accounts are Google/GitHub-only and have no password; Supabase let them enrol TOTP too.
			allowPasswordless: true,
			schema: {
				twoFactor: twoFactorModel,
				user: { fields: { twoFactorEnabled: userPluginFields.twoFactorEnabled } },
			},
		}),
		passkey({
			rpID: relyingParty.rpID,
			rpName: "Phaseo",
			origin: relyingParty.origin,
			schema: { passkey: passkeyModel },
		}),
		sso({
			modelName: ssoProviderModel.modelName,
			fields: ssoProviderModel.fields,
			// Workspace SSO is configured through Phaseo's own team settings (lib/auth/teamSsoSettings.ts), which will
			// call auth.api.registerSSOProvider server-side; people can't register providers through /api/auth.
			providersLimit: 0,
		}),
		...tail,
	] as const;
	// BetterAuthOptions.plugins is a mutable array; `[...T]` drops `readonly` and keeps each element's type.
	return [...plugins] as [...typeof plugins];
}

export function createAuthOptions<const Tail extends BetterAuthPlugin[]>(deps: AuthDeps, tail: Tail) {
	const env = deps.env ?? process.env;
	const production = isProduction(env);
	const sendEmail = deps.sendEmail ?? ((message: Parameters<typeof sendAuthEmail>[0]) => sendAuthEmail(message, env));
	const query = (text: string, values: unknown[]) => deps.pool.query(text, values);
	const userCreated = createUserCreatedHook({ query, fetchImpl: deps.fetchImpl, env, log: console });
	const cookieDomain = env.BETTER_AUTH_COOKIE_DOMAIN?.trim();

	const options = {
		appName: "Phaseo",
		baseURL: resolveBaseURL(env),
		basePath: "/api/auth",
		secret: requiredSecret(env),
		trustedOrigins: resolveTrustedOrigins(env),
		database: {
			dialect: new PostgresDialect({ pool: deps.pool }),
			type: "postgres",
			// Qualifies every statement as "auth"."users" etc., so nothing depends on the connection's search_path
			// (PgBouncer in transaction mode drops startup `options`).
			schemaName: AUTH_SCHEMA,
			// The `dialect` form defaults to no transactions; the bare-Pool form turns them on. Keep them on.
			transaction: true,
		},
		user: {
			...userModel,
			additionalFields: {
				userMetadata: { type: "json", required: false, input: false, fieldName: userLegacyFields.userMetadata },
				appMetadata: { type: "json", required: false, input: false, fieldName: userLegacyFields.appMetadata },
				lastSignInAt: { type: "date", required: false, input: false, fieldName: userLegacyFields.lastSignInAt },
				mfaReenrollmentRequired: {
					type: "boolean",
					required: false,
					defaultValue: false,
					input: false,
					fieldName: userLegacyFields.mfaReenrollmentRequired,
				},
			},
			changeEmail: {
				enabled: true,
				sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
					await sendEmail({
						to: user.email,
						subject: "Confirm your new Phaseo email address",
						html: renderAuthEmail({
							intro: `Confirm changing your Phaseo email address to ${newEmail}.`,
							action: "Confirm email change",
							url,
							outro: "If you didn't ask for this, reset your password now.",
						}),
					});
				},
			},
			deleteUser: { enabled: true },
		},
		session: {
			...sessionModel,
			additionalFields: {
				aal: { type: "string", required: false, defaultValue: "aal1", input: false, fieldName: sessionLegacyFields.aal },
			},
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24,
			// Signed session snapshot in a cookie for 5 minutes, so most page loads don't read auth.sessions.
			cookieCache: { enabled: true, maxAge: 5 * 60 },
		},
		account: {
			...accountModel,
			// Supabase links identities that share a verified email; keep that for the three providers in use.
			accountLinking: { enabled: true, trustedProviders: [...SOCIAL_PROVIDERS] },
			encryptOAuthTokens: true,
		},
		verification: verificationModel,
		emailAndPassword: {
			enabled: true,
			// Supabase's "Confirm email" is on: sign-up ends at "check your email" (sign-up/actions.ts).
			requireEmailVerification: true,
			password: passwordOptions,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				await sendEmail({
					to: user.email,
					subject: "Reset your Phaseo password",
					html: renderAuthEmail({
						intro: "Use the link below to choose a new Phaseo password.",
						action: "Reset password",
						url,
						outro: "If you didn't ask for this, you can ignore this email.",
					}),
				});
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				await sendEmail({
					to: user.email,
					subject: "Confirm your Phaseo email address",
					html: renderAuthEmail({
						intro: "Confirm this email address for your Phaseo account.",
						action: "Confirm email",
						url,
						outro: "If you didn't sign up for Phaseo, you can ignore this email.",
					}),
				});
			},
		},
		socialProviders: {
			google: socialCredentials(env, "google"),
			github: socialCredentials(env, "github"),
			gitlab: socialCredentials(env, "gitlab"),
		},
		databaseHooks: {
			user: {
				create: { after: async (user) => userCreated(user) },
				update: {
					// Enrolling TOTP again clears the re-enrolment flag set by the Supabase import.
					before: async (data) =>
						data.twoFactorEnabled === true ? { data: { ...data, mfaReenrollmentRequired: false } } : undefined,
				},
			},
			session: {
				create: {
					before: async (session, ctx) => ({ data: { ...session, aal: assuranceForNewSession(ctx?.path) } }),
					// Supabase's auth.users.last_sign_in_at, which the dashboard and exports still read.
					after: async (session) => {
						await deps.pool.query(`update ${AUTH_SCHEMA}.users set last_sign_in_at = now() where id = $1::uuid`, [
							session.userId,
						]);
					},
				},
			},
		},
		hooks: {
			// 1. A password sign-in that verified a Supabase bcrypt hash rehashes it with scrypt.
			// 2. A TOTP/backup-code verify inside an existing session (social, passkey or SSO first factor) upgrades that
			//    session to aal2. Verifies that create a session are handled by session.create.before above.
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path === PASSWORD_SIGN_IN_PATH) {
					// Supabase bcrypt hash → scrypt, now that the plaintext has been verified (password.ts).
					const signedIn = ctx.context.newSession;
					if (!signedIn || isAPIError(ctx.context.returned)) return;
					const { internalAdapter } = ctx.context;
					await upgradeLegacyPasswordHash({
						userId: signedIn.user.id,
						password: (ctx.body as { password?: unknown } | undefined)?.password,
						findCredentialAccount: (userId) => internalAdapter.findCredentialAccount(userId),
						updateAccount: (accountId, data) => internalAdapter.updateAccount(accountId, data),
						hash: (password) => ctx.context.password.hash(password),
						log: console,
					});
					return;
				}
				if (!isTwoFactorVerifyPath(ctx.path)) return;
				if (isAPIError(ctx.context.returned)) return;
				if (ctx.context.newSession) return;
				const current = await getSessionFromCtx(ctx);
				if (!current || normaliseAssurance(current.session.aal) === "aal2") return;
				const updated = await ctx.context.internalAdapter.updateSession(current.session.token, { aal: "aal2" });
				if (!updated) return;
				// Re-issue the cookie so the 5-minute cookie cache doesn't keep reporting aal1.
				await setSessionCookie(ctx, { session: { ...current.session, ...updated }, user: current.user });
			}),
		},
		rateLimit: {
			// Vercel runs many instances, so memory storage would give each its own counter; Upstash is a dependency
			// but unused and unprovisioned; Workers KV isn't reachable from Vercel. auth.rate_limits it is.
			enabled: true,
			storage: "database",
			modelName: rateLimitModel.modelName,
			fields: rateLimitModel.fields,
			window: 60,
			max: 100,
			customRules: {
				// Read-only and hot; limiting them would add a write to every page load.
				"/get-session": false,
				"/token": false,
				"/jwks": false,
			},
		},
		advanced: {
			database: { generateId: "uuid" },
			cookiePrefix: "phaseo",
			useSecureCookies: production,
			defaultCookieAttributes: { sameSite: "lax", httpOnly: true, path: "/" },
			// Host-only by default: api.phaseo.app takes Bearer tokens, not cookies. Set BETTER_AUTH_COOKIE_DOMAIN
			// (e.g. ".phaseo.app") only if a subdomain must read the session cookie.
			...(cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : {}),
			ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-real-ip"] },
		},
		plugins: phaseoPlugins(env, tail),
	} satisfies BetterAuthOptions;

	return options;
}
