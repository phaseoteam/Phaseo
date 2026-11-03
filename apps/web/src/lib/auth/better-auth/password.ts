import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * Passwords imported from Supabase Auth are bcrypt (`$2a$10$…`; `$2b$`/`$2y$` are the same algorithm). New and
 * changed passwords use Better Auth's default scrypt hash (`<salt hex>:<key hex>`). A bcrypt hash is replaced by a
 * scrypt one the first time its owner signs in with it (`upgradeLegacyPasswordHash`, called from options.ts), or
 * when they change or reset their password.
 */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isLegacyBcryptHash(hash: string): boolean {
	return BCRYPT_HASH.test(hash);
}

export async function hashNewPassword(password: string): Promise<string> {
	return hashPassword(password);
}

export async function verifyStoredPassword(input: { hash: string; password: string }): Promise<boolean> {
	const { hash, password } = input;
	if (!hash) return false;
	if (isLegacyBcryptHash(hash)) return bcrypt.compare(password, hash);
	// Anything else that looks like bcrypt is malformed; never hand it to scrypt, which would throw.
	if (hash.startsWith("$2")) return false;
	try {
		return await verifyPassword({ hash, password });
	} catch {
		// A malformed stored hash is a failed sign-in, not a server error.
		return false;
	}
}

/** The `emailAndPassword.password` option. */
export const passwordOptions = {
	hash: hashNewPassword,
	verify: verifyStoredPassword,
};

export const PASSWORD_SIGN_IN_PATH = "/sign-in/email";

type CredentialAccount = { id: string; password?: string | null };

/**
 * After a successful email + password sign-in, replace a Supabase bcrypt hash with Better Auth's scrypt hash of the
 * password that was just verified. Only `/sign-in/email` carries the plaintext, so users with TOTP enabled (whose
 * sign-in finishes on a verify endpoint) keep their bcrypt hash until they change or reset their password; it still
 * verifies. Never throws: a failed upgrade must not fail the sign-in.
 */
export async function upgradeLegacyPasswordHash(input: {
	userId: string;
	password: unknown;
	findCredentialAccount: (userId: string) => Promise<CredentialAccount | null | undefined>;
	updateAccount: (accountId: string, data: { password: string }) => Promise<unknown>;
	hash?: (password: string) => Promise<string>;
	log?: Pick<Console, "warn">;
}): Promise<boolean> {
	if (typeof input.password !== "string" || !input.password) return false;
	try {
		const account = await input.findCredentialAccount(input.userId);
		if (!account?.password || !isLegacyBcryptHash(account.password)) return false;
		// Belt and braces: only rehash a password that matches what is stored.
		if (!(await bcrypt.compare(input.password, account.password))) return false;
		const hashed = await (input.hash ?? hashNewPassword)(input.password);
		await input.updateAccount(account.id, { password: hashed });
		return true;
	} catch (error) {
		input.log?.warn("[better-auth] legacy bcrypt password upgrade failed", {
			userId: input.userId,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}
