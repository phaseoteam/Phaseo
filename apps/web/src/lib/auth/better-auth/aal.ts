/**
 * Supabase Auth's authenticator assurance level (AAL), kept on Better Auth sessions.
 *
 * Supabase marks a session `aal1` after a first factor (password, OAuth, passkey, SSO) and `aal2` once a TOTP code
 * has been verified in it. Phaseo gates pages (proxy → /auth/verify-mfa), server actions, web-api and the OAuth
 * server on "has a verified factor ⇒ session must be aal2".
 *
 * Better Auth's twoFactor plugin only intercepts /sign-in/email, /sign-in/username and /sign-in/phone-number
 * (better-auth 1.7.13, plugins/two-factor/index.mjs): there it holds the session back until the code is verified, so
 * the session it then creates is already second-factor. Social, passkey and SSO sign-ins get a session straight
 * away, and verifying TOTP inside that session changes nothing on it. So Phaseo records the level itself:
 *
 * - every new session starts at `aal1`;
 * - a session created by a two-factor verify endpoint (the password + TOTP sign-in, or enabling 2FA) is `aal2`;
 * - a successful verify inside an existing session upgrades that session to `aal2` (see `upgradeSessionAfterVerify`).
 *
 * The JWT carries `aal`, so the Workers keep their current checks.
 */
export type AssuranceLevel = "aal1" | "aal2";

export const TWO_FACTOR_VERIFY_PATHS: ReadonlySet<string> = new Set([
	"/two-factor/verify-totp",
	"/two-factor/verify-backup-code",
	"/two-factor/verify-otp",
]);

export function isTwoFactorVerifyPath(path: string | undefined | null): boolean {
	return typeof path === "string" && TWO_FACTOR_VERIFY_PATHS.has(path);
}

/** The level a new session gets, from the endpoint that creates it. */
export function assuranceForNewSession(path: string | undefined | null): AssuranceLevel {
	return isTwoFactorVerifyPath(path) ? "aal2" : "aal1";
}

export function normaliseAssurance(value: unknown): AssuranceLevel {
	return value === "aal2" ? "aal2" : "aal1";
}

/**
 * Whether a user/session pair may act as the person where Phaseo requires MFA today (Supabase: a verified factor
 * and aal1 ⇒ must verify first). A user flagged for MFA re-enrolment (their Supabase TOTP secret couldn't be
 * carried over) is treated like an unverified MFA user until they enrol again.
 */
export function needsSecondFactor(input: {
	twoFactorEnabled?: boolean | null;
	mfaReenrollmentRequired?: boolean | null;
	aal?: unknown;
}): boolean {
	if (input.mfaReenrollmentRequired) return true;
	return Boolean(input.twoFactorEnabled) && normaliseAssurance(input.aal) !== "aal2";
}
