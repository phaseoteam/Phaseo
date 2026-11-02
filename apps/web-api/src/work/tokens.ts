// Tokens for the work tracker's public endpoints: intake forms (pwf_), error projects (pwe_) and
// GitHub bridges (pwg_). A token is shown once; the database keeps its SHA-256 hex and a short
// prefix so people can tell tokens apart.

export type WorkTokenKind = "form" | "errors" | "github";

const PREFIXES: Record<WorkTokenKind, string> = { form: "pwf_", errors: "pwe_", github: "pwg_" };
const DISPLAY_PREFIX_LENGTH = 12;
const TOKEN_PATTERN = /^pw[feg]_[A-Za-z0-9_-]{43}$/;

function base64url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashWorkToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A new token of the kind, with the hash and display prefix to store. */
export async function newWorkToken(kind: WorkTokenKind): Promise<{ token: string; hash: string; prefix: string }> {
	const token = PREFIXES[kind] + base64url(crypto.getRandomValues(new Uint8Array(32)));
	return { token, hash: await hashWorkToken(token), prefix: token.slice(0, DISPLAY_PREFIX_LENGTH) };
}

/** Whether the text looks like a token of the kind, checked before any database lookup. */
export function isWorkToken(kind: WorkTokenKind, value: string): boolean {
	return TOKEN_PATTERN.test(value) && value.startsWith(PREFIXES[kind]);
}
