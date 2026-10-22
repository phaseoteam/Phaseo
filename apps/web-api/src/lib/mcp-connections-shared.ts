// Generated from packages/shared/mcp-connections/index.ts by scripts/sync-mcp-connections.mjs. Do not edit.
// Connected MCP servers: how their secrets are encrypted at rest, and the
// small naming rules both sides must agree on.
//
// The web API encrypts tokens when someone connects a server; the gateway
// decrypts and refreshes them when a tool is called. Each uses a generated
// copy (scripts/sync-mcp-connections.mjs). Keep it dependency-free.
//
// Secrets are AES-256-GCM. The additional data binds each ciphertext to its
// row, owner and field, so a value copied into another row, or an access token
// swapped with a refresh token, fails to decrypt. Stored format:
//   mcpv<key version>.<base64url iv>.<base64url ciphertext and tag>

export type ConnectionSecretField = "access_token" | "refresh_token" | "client_secret" | "code_verifier";

export type ConnectionSecretContext = {
	/** The mcp_connections, mcp_oauth_clients or mcp_oauth_pending row id. */
	recordId: string;
	field: ConnectionSecretField;
	workspaceId?: string | null;
	userId?: string | null;
};

export type ConnectionKeyring = {
	activeVersion: number;
	/** Base64 (or "base64:"-prefixed) 32-byte keys by version. */
	keys: Record<number, string>;
};

const ENVELOPE_PATTERN = /^mcpv(\d{1,4})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

/** Reads MCP_CONNECTIONS_KEY_V<n> and MCP_CONNECTIONS_ACTIVE_KEY_VERSION (default 1). */
export function connectionKeyringFromEnv(env: Record<string, unknown>): ConnectionKeyring {
	const keys: Record<number, string> = {};
	for (const [name, value] of Object.entries(env)) {
		const match = /^MCP_CONNECTIONS_KEY_V(\d{1,4})$/.exec(name);
		if (match && typeof value === "string" && value.trim()) keys[Number(match[1])] = value.trim();
	}
	const active = Number(env.MCP_CONNECTIONS_ACTIVE_KEY_VERSION ?? 1);
	return { activeVersion: Number.isInteger(active) && active > 0 ? active : 1, keys };
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
	let text = value.trim();
	if (text.startsWith("base64:")) text = text.slice(7);
	text = text.replace(/-/g, "+").replace(/_/g, "/");
	while (text.length % 4) text += "=";
	const binary = atob(text);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importKey(keyring: ConnectionKeyring, version: number, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
	const material = keyring.keys[version];
	if (!material) throw new Error(`mcp_connections_key_v${version}_missing`);
	const bytes = base64ToBytes(material);
	if (bytes.byteLength !== 32) throw new Error(`mcp_connections_key_v${version}_must_be_32_bytes`);
	return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [usage]);
}

function additionalData(context: ConnectionSecretContext, version: number): Uint8Array<ArrayBuffer> {
	const text = ["mcp-connection", context.workspaceId ?? "-", context.userId ?? "-", context.recordId, context.field, `v${version}`].join("|");
	const encoded = new TextEncoder().encode(text);
	const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));
	bytes.set(encoded);
	return bytes;
}

export async function encryptConnectionSecret(keyring: ConnectionKeyring, plaintext: string, context: ConnectionSecretContext): Promise<string> {
	const version = keyring.activeVersion;
	const key = await importKey(keyring, version, "encrypt");
	const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: additionalData(context, version) },
		key,
		new TextEncoder().encode(plaintext),
	);
	return `mcpv${version}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(sealed))}`;
}

export async function decryptConnectionSecret(keyring: ConnectionKeyring, envelope: string, context: ConnectionSecretContext): Promise<string> {
	const match = ENVELOPE_PATTERN.exec(envelope.trim());
	if (!match) throw new Error("mcp_connection_secret_malformed");
	const version = Number(match[1]);
	const key = await importKey(keyring, version, "decrypt");
	try {
		const opened = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: base64ToBytes(match[2] ?? ""), additionalData: additionalData(context, version) },
			key,
			base64ToBytes(match[3] ?? ""),
		);
		return new TextDecoder().decode(opened);
	} catch {
		throw new Error("mcp_connection_secret_undecryptable");
	}
}

/** Key version a stored secret was sealed with, so a rotation job can find old rows. */
export function connectionSecretKeyVersion(envelope: string): number | null {
	const match = ENVELOPE_PATTERN.exec(envelope.trim());
	return match ? Number(match[1]) : null;
}

/** Stored in place of the OAuth state so a database read cannot replay a sign-in. */
export async function hashOAuthState(state: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const LABEL_SLUG_PATTERN = /^[a-z][a-z0-9_]{0,23}$/;

/** "Linear (work)" -> "linear_work". Matches mcp_connections_label_slug_check. */
export function labelSlugFromName(name: string): string {
	const slug = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "").slice(0, 24).replace(/_+$/g, "");
	return LABEL_SLUG_PATTERN.test(slug) ? slug : "server";
}

export const HUB_TOOL_NAME_MAX = 64;

function shortHash(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * The name a connected tool gets on Phaseo's MCP server: "<label>__<tool>".
 * Characters clients reject become "_", and names over 64 characters are cut
 * and end in a hash of the full name so they stay unique.
 */
export function hubToolName(labelSlug: string, toolName: string): string {
	const full = `${labelSlug}__${toolName.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
	if (full.length <= HUB_TOOL_NAME_MAX) return full;
	return `${full.slice(0, HUB_TOOL_NAME_MAX - 7)}_${shortHash(full)}`;
}
