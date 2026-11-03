/**
 * How Better Auth's models map onto the `auth` schema (database/planetscale/README.md, "Identity model").
 *
 * Better Auth names tables and columns in camelCase by default, and its `casing` option does not rename columns
 * (checked against better-auth 1.7.13: `auth generate` still emits "emailVerified"). So every field is mapped here
 * explicitly, and `database/planetscale/migrations/0001_auth.sql` is generated from these maps. Change both together.
 *
 * Plain data only: this module is imported by the server instance and the CLI config. The Supabase user importer
 * (database/planetscale/scripts/import-supabase-users.ts) writes the same columns in plain SQL; its test applies the
 * real 0001 and signs in through Better Auth, so a rename here that 0001 or the importer misses fails there.
 */

export const AUTH_SCHEMA = "auth";

export const userModel = {
	modelName: "users",
	fields: {
		name: "name",
		email: "email",
		emailVerified: "email_verified",
		image: "image",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
} as const;

/** Columns added to `auth.users` by plugins (twoFactor, admin). */
export const userPluginFields = {
	twoFactorEnabled: "two_factor_enabled",
	role: "role",
	banned: "banned",
	banReason: "ban_reason",
	banExpires: "ban_expires",
} as const;

/** Phaseo's own `auth.users` columns, carried over from Supabase Auth. */
export const userLegacyFields = {
	userMetadata: "raw_user_meta_data",
	appMetadata: "raw_app_meta_data",
	lastSignInAt: "last_sign_in_at",
	mfaReenrollmentRequired: "mfa_reenrollment_required",
} as const;

export const sessionModel = {
	modelName: "sessions",
	fields: {
		expiresAt: "expires_at",
		token: "token",
		createdAt: "created_at",
		updatedAt: "updated_at",
		ipAddress: "ip_address",
		userAgent: "user_agent",
		userId: "user_id",
	},
} as const;

export const sessionPluginFields = {
	impersonatedBy: "impersonated_by",
} as const;

/** Phaseo's assurance level for the session ("aal1" | "aal2"), Supabase Auth's AAL. See aal.ts. */
export const sessionLegacyFields = {
	aal: "aal",
} as const;

export const accountModel = {
	modelName: "accounts",
	fields: {
		accountId: "account_id",
		providerId: "provider_id",
		userId: "user_id",
		accessToken: "access_token",
		refreshToken: "refresh_token",
		idToken: "id_token",
		accessTokenExpiresAt: "access_token_expires_at",
		refreshTokenExpiresAt: "refresh_token_expires_at",
		scope: "scope",
		password: "password",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
} as const;

export const verificationModel = {
	modelName: "verifications",
	fields: {
		identifier: "identifier",
		value: "value",
		expiresAt: "expires_at",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
} as const;

export const jwksModel = {
	modelName: "jwks",
	fields: {
		publicKey: "public_key",
		privateKey: "private_key",
		createdAt: "created_at",
		expiresAt: "expires_at",
		alg: "alg",
		crv: "crv",
	},
} as const;

export const twoFactorModel = {
	modelName: "two_factors",
	fields: {
		secret: "secret",
		backupCodes: "backup_codes",
		userId: "user_id",
		verified: "verified",
		failedVerificationCount: "failed_verification_count",
		lockedUntil: "locked_until",
	},
} as const;

export const passkeyModel = {
	modelName: "passkeys",
	fields: {
		name: "name",
		publicKey: "public_key",
		userId: "user_id",
		credentialID: "credential_id",
		counter: "counter",
		deviceType: "device_type",
		backedUp: "backed_up",
		transports: "transports",
		createdAt: "created_at",
		aaguid: "aaguid",
	},
} as const;

export const ssoProviderModel = {
	modelName: "sso_providers",
	fields: {
		issuer: "issuer",
		oidcConfig: "oidc_config",
		samlConfig: "saml_config",
		userId: "user_id",
		providerId: "provider_id",
		organizationId: "organization_id",
		domain: "domain",
	},
} as const;

export const rateLimitModel = {
	modelName: "rate_limits",
	fields: {
		key: "key",
		count: "count",
		lastRequest: "last_request",
	},
} as const;
