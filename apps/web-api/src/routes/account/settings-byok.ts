import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { getDataClient } from "@/data/supabase";
import { requireUser } from "@/auth/requireUser";
import { requireAccountWorkspace } from "./context";

function canonicalProviderId(value: unknown): string {
	const providerId = String(value ?? "").trim().toLowerCase();
	return providerId === "x-ai" || providerId === "xai" ? "spacex-ai" : providerId;
}

function validateProviderKey(providerId: string, rawValue: unknown): { value: string; strict: boolean } {
	const value = String(rawValue ?? "").trim();
	if (!value) throw new Error("Key is required.");
	const patterns: Record<string, RegExp> = {
		anthropic: /^sk-ant-[A-Za-z0-9_-]{16,}$/,
		openai: /^sk-[A-Za-z0-9_-]{16,}$/,
		deepseek: /^sk-[A-Za-z0-9_-]{16,}$/,
		alibaba: /^sk-[A-Za-z0-9_-]{16,}$/,
		mistral: /^sk-[A-Za-z0-9_-]{16,}$/,
		moonshotai: /^sk-[A-Za-z0-9_-]{16,}$/,
		groq: /^gsk_[A-Za-z0-9_-]{16,}$/,
		"google-ai-studio": /^AIza[0-9A-Za-z_-]{20,}$/,
	};
	const pattern = patterns[providerId];
	if (pattern && !pattern.test(value)) throw new Error("Key format is invalid for this provider.");
	if (["google-vertex", "cloudflare", "azure"].includes(providerId)) {
		let parsed: any;
		try { parsed = JSON.parse(value); } catch { throw new Error("Valid JSON credentials are required for this provider."); }
		if (providerId === "google-vertex" && !(parsed?.type === "service_account" && parsed.client_email && parsed.private_key)) throw new Error("Google service-account credentials are incomplete.");
		if (providerId === "cloudflare" && !(parsed?.apiToken && parsed.accountId)) throw new Error("Cloudflare credentials require apiToken and accountId.");
		if (providerId === "azure" && !(Array.isArray(parsed?.deployments) && parsed.deployments.length)) throw new Error("Azure credentials require at least one deployment mapping.");
		return { value, strict: true };
	}
	if (providerId === "amazon-bedrock" && value.startsWith("{")) {
		let parsed: any;
		try { parsed = JSON.parse(value); } catch { throw new Error("Amazon Bedrock credentials JSON is invalid."); }
		if (!(parsed?.accessKeyId && parsed.secretAccessKey && (parsed.region || parsed.awsRegion))) throw new Error("Amazon Bedrock credentials are incomplete.");
		return { value, strict: true };
	}
	if (!value.startsWith("{") && /\s/.test(value)) throw new Error("Key should not contain spaces or line breaks.");
	if (!pattern && value.length < 16) throw new Error("Key must be at least 16 characters.");
	return { value, strict: Boolean(pattern) };
}

function decode(value: string): Uint8Array {
	const raw = value.startsWith("base64:") ? value.slice(7) : value;
	const binary = atob(raw);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return Uint8Array.from(bytes).buffer;
}

async function encrypt(env: Env, plaintext: string) {
	const version = Number(env.BYOK_ACTIVE_KEY_VERSION ?? "1") || 1;
	if (version !== 1 || !env.BYOK_KMS_KEY_V1) throw new Error(`Missing BYOK_KMS_KEY_V${version}`);
	const keyBytes = decode(env.BYOK_KMS_KEY_V1);
	if (keyBytes.length !== 32) throw new Error("BYOK key must be 32 bytes (AES-256)");
	const key = await crypto.subtle.importKey("raw", arrayBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: arrayBuffer(iv) }, key, new TextEncoder().encode(plaintext)));
	const ciphertext = encrypted.slice(0, -16);
	const tag = encrypted.slice(-16);
	const fingerprintSalt = env.BYOK_FINGERPRINT_PEPPER ? decode(env.BYOK_FINGERPRINT_PEPPER) : keyBytes;
	const fingerprintMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(plaintext), "PBKDF2", false, ["deriveBits"]);
	const fingerprint = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 210_000, salt: arrayBuffer(fingerprintSalt) }, fingerprintMaterial, 256);
	return {
		enc_value: `\\x${bytesToHex(ciphertext)}`,
		enc_iv: `\\x${bytesToHex(iv)}`,
		enc_tag: `\\x${bytesToHex(tag)}`,
		key_version: version,
		fingerprint_sha256: bytesToHex(new Uint8Array(fingerprint)),
		prefix: plaintext.slice(0, 6),
		suffix: plaintext.slice(-4),
	};
}

async function keyContext(request: Request, env: Env, keyId: string) {
	const user = await requireUser(request, env);
	if (!user) return null;
	const client = getDataClient(env);
	const key = await client.from("byok_keys").select("*").eq("id", keyId).maybeSingle();
	if (key.error || !key.data?.workspace_id) return null;
	const context = await requireAccountWorkspace({ request, env, workspaceId: String(key.data.workspace_id) });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return null;
	return { context, key: key.data };
}

export const accountSettingsByokRouter = new Hono<{ Bindings: Env }>();

accountSettingsByokRouter.post("/byok", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(body.workspaceId ?? "") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const providerId = canonicalProviderId(body.providerId);
	const name = String(body.name ?? "").trim();
	if (!name || !providerId) return c.json({ error: "Missing name or providerId" }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		const checked = validateProviderKey(providerId, body.value);
		const encrypted = await encrypt(c.env, checked.value);
		const routingMode = body.always_use === true ? "priority" : "fallback";
		const lastInMode = await context.client
			.from("byok_keys")
			.select("sort_order")
			.eq("workspace_id", context.workspaceId)
			.eq("provider_id", providerId)
			.eq("routing_mode", routingMode)
			.order("sort_order", { ascending: false })
			.limit(1)
			.maybeSingle();
		if (lastInMode.error) throw lastInMode.error;
		const payload = {
			workspace_id: context.workspaceId,
			provider_id: providerId,
			name,
			enabled: body.enabled !== false,
			always_use: body.always_use === true,
			routing_mode: routingMode,
			sort_order: Number(lastInMode.data?.sort_order ?? -1) + 1,
			...encrypted,
			verification_status: checked.strict ? "format_valid_strict" : "format_valid",
			error_message: null,
			last_verified_at: new Date().toISOString(),
			created_by: context.user.id,
		};
		const inserted = await context.client.from("byok_keys").insert(payload).select("id").maybeSingle();
		if (inserted.error) throw inserted.error;
		return c.json({ id: inserted.data?.id, mode: "created" }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "BYOK key write failed" }, 409, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsByokRouter.put("/byok/:keyId", async (c) => {
	const loaded = await keyContext(c.req.raw, c.env, c.req.param("keyId"));
	if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	try {
		const providerId = canonicalProviderId(loaded.key.provider_id);
		const update: Record<string, unknown> = {};
		if (providerId !== loaded.key.provider_id) update.provider_id = providerId;
		if (typeof body.name === "string") update.name = body.name;
		if (typeof body.enabled === "boolean") update.enabled = body.enabled;
		if (typeof body.always_use === "boolean") {
			const nextRoutingMode = body.always_use ? "priority" : "fallback";
			const currentRoutingMode = loaded.key.routing_mode === "priority" || loaded.key.routing_mode === "fallback"
				? loaded.key.routing_mode
				: loaded.key.always_use === true ? "priority" : "fallback";
			update.always_use = body.always_use;
			update.routing_mode = nextRoutingMode;
			if (nextRoutingMode !== currentRoutingMode) {
				const lastInMode = await loaded.context.client
					.from("byok_keys")
					.select("sort_order")
					.eq("workspace_id", loaded.context.workspaceId)
					.eq("provider_id", providerId)
					.eq("routing_mode", nextRoutingMode)
					.neq("id", loaded.key.id)
					.order("sort_order", { ascending: false })
					.limit(1)
					.maybeSingle();
				if (lastInMode.error) throw lastInMode.error;
				update.sort_order = Number(lastInMode.data?.sort_order ?? -1) + 1;
			}
		}
		if (typeof body.value === "string") {
			const checked = validateProviderKey(providerId, body.value);
			Object.assign(update, await encrypt(c.env, checked.value), { verification_status: checked.strict ? "format_valid_strict" : "format_valid", error_message: null, last_verified_at: new Date().toISOString() });
		}
		const result = await loaded.context.client.from("byok_keys").update(update).eq("id", loaded.key.id).eq("workspace_id", loaded.context.workspaceId);
		if (result.error) throw result.error;
		return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "BYOK key write failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsByokRouter.delete("/byok/:keyId", async (c) => {
	const loaded = await keyContext(c.req.raw, c.env, c.req.param("keyId"));
	if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await loaded.context.client.from("byok_keys").delete().eq("id", loaded.key.id).eq("workspace_id", loaded.context.workspaceId);
	if (result.error) return c.json({ error: "BYOK key delete failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsByokRouter.post("/byok/:keyId/reorder", async (c) => {
	const loaded = await keyContext(c.req.raw, c.env, c.req.param("keyId"));
	if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const direction = body.direction === "up" ? "up" : body.direction === "down" ? "down" : null;
	if (!direction) return c.json({ error: "invalid_direction" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await loaded.context.userClient.rpc("reorder_v2_byok_key", {
		p_workspace_id: loaded.context.workspaceId,
		p_key_id: loaded.key.id,
		p_direction: direction,
	});
	if (result.error) return c.json({ error: "settings_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsByokRouter.put("/byok-fallback", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(body.workspaceId ?? "") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const existing = await context.client.from("workspace_settings").select("workspace_id").eq("workspace_id", context.workspaceId).maybeSingle();
	if (existing.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const payload = { workspace_id: context.workspaceId, byok_fallback_enabled: body.enabled === true, updated_at: new Date().toISOString() };
	const result = existing.data
		? await context.client.from("workspace_settings").update(payload).eq("workspace_id", context.workspaceId)
		: await context.client.from("workspace_settings").insert({ ...payload, routing_mode: "balanced" });
	if (result.error) return c.json({ error: "settings_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
