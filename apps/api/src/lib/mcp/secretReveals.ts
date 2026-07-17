import { getBindings, getSupabaseAdmin } from "@/runtime/env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const REVEAL_TTL_MS = 10 * 60 * 1000;
const MAX_SECRET_PAYLOAD_BYTES = 16 * 1024;

type SecretActor = { userId: string; workspaceId: string; clientId: string };

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function revealKey(): Promise<CryptoKey> {
	const material = String(getBindings().MCP_SECRET_REVEAL_ENCRYPTION_KEY ?? "").trim();
	if (material.length < 32) throw new Error("mcp_secret_reveal_key_missing");
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`phaseo:mcp-secret-reveal:v1:${material}`));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function isMcpSecretRevealConfigured(): boolean {
	return String(getBindings().MCP_SECRET_REVEAL_ENCRYPTION_KEY ?? "").trim().length >= 32;
}

async function encryptSecrets(approvalId: string, secrets: Record<string, string>) {
	const plaintext = encoder.encode(JSON.stringify(secrets));
	if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_SECRET_PAYLOAD_BYTES) {
		throw new Error("mcp_secret_reveal_payload_invalid");
	}
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: encoder.encode(approvalId) },
		await revealKey(),
		plaintext,
	);
	return { ciphertext: base64Url(new Uint8Array(ciphertext)), iv: base64Url(iv) };
}

async function decryptSecrets(approvalId: string, ciphertext: string, iv: string): Promise<Record<string, string>> {
	const ivBytes = fromBase64Url(iv);
	const ciphertextBytes = fromBase64Url(ciphertext);
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: asArrayBuffer(ivBytes), additionalData: encoder.encode(approvalId) },
		await revealKey(),
		asArrayBuffer(ciphertextBytes),
	);
	const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("mcp_secret_reveal_payload_invalid");
	return Object.fromEntries(
		Object.entries(parsed as Record<string, unknown>)
			.filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);
}

export async function storeMcpSecretReveal(input: {
	actor: SecretActor;
	approvalId: string;
	toolName: string;
	secrets: Record<string, string>;
}) {
	if (!isMcpSecretRevealConfigured()) throw new Error("mcp_secret_reveal_key_missing");
	const entries = Object.entries(input.secrets).filter(([name, value]) => name.length <= 200 && value.length > 0 && value.length <= 8192);
	if (entries.length === 0 || entries.length > 10) throw new Error("mcp_secret_reveal_payload_invalid");
	const { data: approval, error: approvalError } = await getSupabaseAdmin()
		.from("mcp_action_approvals")
		.select("id")
		.eq("id", input.approvalId)
		.eq("user_id", input.actor.userId)
		.eq("workspace_id", input.actor.workspaceId)
		.eq("oauth_client_id", input.actor.clientId)
		.eq("tool_name", input.toolName)
		.not("consumed_at", "is", null)
		.maybeSingle();
	if (approvalError || !approval) return null;
	const encrypted = await encryptSecrets(input.approvalId, Object.fromEntries(entries));
	const expiresAt = new Date(Date.now() + REVEAL_TTL_MS).toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_secret_reveals")
		.insert({
			approval_id: input.approvalId,
			user_id: input.actor.userId,
			workspace_id: input.actor.workspaceId,
			oauth_client_id: input.actor.clientId,
			tool_name: input.toolName,
			secret_ciphertext: encrypted.ciphertext,
			secret_iv: encrypted.iv,
			expires_at: expiresAt,
		})
		.select("id")
		.single();
	if (error || !data?.id) throw new Error("mcp_secret_reveal_store_failed");
	return { revealId: String(data.id), expiresAt };
}

export async function getMcpSecretRevealForUser(revealId: string, userId: string) {
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_secret_reveals")
		.select("id, approval_id, workspace_id, oauth_client_id, tool_name, expires_at, revealed_at, created_at")
		.eq("id", revealId)
		.eq("user_id", userId)
		.maybeSingle();
	if (error) throw new Error("mcp_secret_reveal_lookup_failed");
	return data ?? null;
}

export async function revealMcpSecrets(revealId: string, userId: string) {
	const now = new Date().toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_secret_reveals")
		.update({ revealed_at: now })
		.eq("id", revealId)
		.eq("user_id", userId)
		.is("revealed_at", null)
		.gt("expires_at", now)
		.select("id, approval_id, secret_ciphertext, secret_iv")
		.maybeSingle();
	if (error || !data) return null;
	const secrets = await decryptSecrets(String(data.approval_id), String(data.secret_ciphertext), String(data.secret_iv));
	return { revealId: String(data.id), revealedAt: now, secrets };
}
