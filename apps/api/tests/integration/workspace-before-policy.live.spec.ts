import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.dev.vars") });
loadEnv({ path: path.resolve(__dirname, "../../../.env.local") });
loadEnv({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });

const SUPABASE_URL =
	process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const KEY_PEPPER = process.env.KEY_PEPPER_ACTIVE ?? process.env.KEY_PEPPER ?? "";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const MODEL = "openai/gpt-5-nano";
const SUCCESS_MODEL = "openai/gpt-5.4-nano";

type SeededWorkspace = {
	userId: string;
	workspaceId: string;
	keyId: string;
	apiKey: string;
};

const seededWorkspaces: SeededWorkspace[] = [];

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeKeyV2() {
	const kid = crypto.randomBytes(12).toString("base64url").slice(0, 12);
	const secret = crypto.randomBytes(30).toString("base64url");
	return {
		kid,
		secret,
		plaintext: `aistats_v1_sk_${kid}_${secret}`,
		prefix: kid.slice(0, 6),
	};
}

function hmacSecret(secret: string, pepper: string) {
	return crypto.createHmac("sha256", pepper).update(secret).digest("hex");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false },
});

async function seedWorkspace(args?: {
	balanceNanos?: number;
	providerRestrictionMode?: "none" | "allowlist" | "blocklist";
	providerIds?: string[];
}) {
	const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
	const email = `workspace-before-${suffix}@example.com`;
	const password = `Pw-${suffix}-Z9!`;
	const authResult = await supabase.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
		user_metadata: { full_name: "Workspace Before Test" },
	});
	if (authResult.error || !authResult.data.user?.id) {
		throw authResult.error ?? new Error("Failed to create auth user");
	}

	const userId = authResult.data.user.id;
	const rpcResult = await supabase.rpc("provision_personal_workspace", {
		p_user_id: userId,
		p_display_name: "Workspace Before Test",
	});
	if (rpcResult.error) throw rpcResult.error;
	const rpcRow = Array.isArray(rpcResult.data)
		? (rpcResult.data[0] ?? null)
		: rpcResult.data;
	const workspaceId = String((rpcRow as any)?.workspace_id ?? "");
	if (!workspaceId) {
		throw new Error("Provisioning RPC did not return a workspace id");
	}

	const walletResult = await supabase.from("wallets").upsert(
		{
			workspace_id: workspaceId,
			stripe_customer_id: `cus_test_${suffix}`,
			balance_nanos: args?.balanceNanos ?? 25_000_000_000,
			reserved_nanos: 0,
		},
		{ onConflict: "workspace_id", ignoreDuplicates: false },
	);
	if (walletResult.error) throw walletResult.error;

	if (args?.providerRestrictionMode && args.providerRestrictionMode !== "none") {
		const settingsResult = await supabase.from("workspace_settings").upsert(
			{
				workspace_id: workspaceId,
				provider_restriction_mode: args.providerRestrictionMode,
				provider_restriction_provider_ids: args.providerIds ?? [],
				provider_restriction_enforce_allowed: true,
			},
			{ onConflict: "workspace_id", ignoreDuplicates: false },
		);
		if (settingsResult.error) throw settingsResult.error;
	}

	const key = makeKeyV2();
	const keyResult = await supabase
		.from("keys")
		.insert({
			workspace_id: workspaceId,
			name: `Workspace Before ${suffix}`,
			hash: hmacSecret(key.secret, KEY_PEPPER),
			prefix: key.prefix,
			status: "active",
			scopes: "[]",
			created_by: userId,
			kid: key.kid,
		})
		.select("id")
		.single();
	if (keyResult.error || !keyResult.data?.id) {
		throw keyResult.error ?? new Error("Failed to create gateway key");
	}

	const seeded = {
		userId,
		workspaceId,
		keyId: String(keyResult.data.id),
		apiKey: key.plaintext,
	};
	seededWorkspaces.push(seeded);
	return seeded;
}

async function attachAllowedModelGuardrail(args: {
	workspaceId: string;
	keyId: string;
	allowedApiModels: string[];
}) {
	const guardrailResult = await supabase
		.from("workspace_guardrails")
		.insert({
			workspace_id: args.workspaceId,
			name: `Allowed models ${Date.now()}`,
			enabled: true,
			allowed_api_model_ids: args.allowedApiModels,
		})
		.select("id")
		.single();
	if (guardrailResult.error || !guardrailResult.data?.id) {
		throw guardrailResult.error ?? new Error("Failed to create guardrail");
	}

	const linkResult = await supabase.from("key_guardrails").insert({
		key_id: args.keyId,
		guardrail_id: guardrailResult.data.id,
	});
	if (linkResult.error) throw linkResult.error;
}

async function postGatewayRequest(
	apiKey: string,
	body: Record<string, unknown>,
) {
	return fetch(`${GATEWAY_URL}/responses`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});
}

async function sendGatewayRequest(
	apiKey: string,
	body: Record<string, unknown>,
	options?: { retryUnauthorised?: boolean },
) {
	const retryUnauthorised = options?.retryUnauthorised ?? true;

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const response = await postGatewayRequest(apiKey, body);
		if (!retryUnauthorised || response.status !== 401 || attempt === 4) {
			return response;
		}

		const text = await response.text().catch(() => "");
		let payload: any = null;
		try {
			payload = text ? JSON.parse(text) : null;
		} catch {
			payload = null;
		}

		if (payload?.error !== "unauthorised") {
			return new Response(text, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		}

		await sleep(250 * (attempt + 1));
	}

	return postGatewayRequest(apiKey, body);
}

async function waitForGatewayReady() {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		try {
			const response = await fetch(`${GATEWAY_URL}/responses`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			});
			if (response.status === 400 || response.status === 401) {
				return;
			}
		} catch {
			// Keep polling until wrangler is ready.
		}
		await sleep(500);
	}

	throw new Error(`Gateway was not ready at ${GATEWAY_URL}`);
}

describe("Gateway before-stage workspace policy live checks", () => {
	beforeAll(() => {
		if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error("Supabase env is required for live workspace-policy tests");
		}
		if (!KEY_PEPPER) {
			throw new Error("KEY_PEPPER or KEY_PEPPER_ACTIVE is required");
		}
	});

	beforeAll(async () => {
		await waitForGatewayReady();
	});

	afterEach(async () => {
		const seeded = seededWorkspaces.pop();
		if (!seeded) return;

		await supabase.auth.admin.deleteUser(seeded.userId).catch(() => undefined);
		try {
			await supabase.from("workspaces").delete().eq("id", seeded.workspaceId);
		} catch {
			// Best-effort cleanup only.
		}
		try {
			await supabase.from("users").delete().eq("user_id", seeded.userId);
		} catch {
			// Best-effort cleanup only.
		}
	});

	it("rejects an invalid API key secret before loading gateway context", async () => {
		const seeded = await seedWorkspace();
		const badKey = `${seeded.apiKey}x`;

		const response = await sendGatewayRequest(
			badKey,
			{
			model: MODEL,
			input: "hello",
			},
			{ retryUnauthorised: false },
		);

		expect(response.status).toBe(401);
		const payload = await response.json();
		expect(payload.error).toBe("unauthorised");
	});

	it("returns insufficient_funds when the billed workspace wallet has no balance", async () => {
		const seeded = await seedWorkspace({ balanceNanos: 0 });

		const response = await sendGatewayRequest(seeded.apiKey, {
			model: MODEL,
			input: "hello",
		});

		expect(response.status).toBe(402);
		const payload = await response.json();
		expect(payload.error).toBe("insufficient_funds");
	});

	it("returns model_not_allowed_by_workspace_policy for disallowed api models", async () => {
		const seeded = await seedWorkspace();
		await attachAllowedModelGuardrail({
			workspaceId: seeded.workspaceId,
			keyId: seeded.keyId,
			allowedApiModels: ["openai/gpt-4.1-mini"],
		});

		const response = await sendGatewayRequest(seeded.apiKey, {
			model: MODEL,
			input: "hello",
		});

		expect(response.status).toBe(400);
		const payload = await response.json();
		expect(payload.error).toBe("validation_error");
		expect(payload.details?.[0]?.keyword).toBe(
			"model_not_allowed_by_workspace_policy",
		);
	});

	it("merges workspace settings with request provider hints before routing", async () => {
		const seeded = await seedWorkspace({
			providerRestrictionMode: "allowlist",
			providerIds: ["openai"],
		});

		const response = await sendGatewayRequest(seeded.apiKey, {
			model: MODEL,
			input: "hello",
			provider: {
				ignore: ["openai"],
			},
		});

		expect(response.status).toBe(400);
		const payload = await response.json();
		expect(payload.error).toBe("validation_error");
		expect(payload.details?.[0]?.keyword).toBe(
			"no_providers_after_workspace_policy_filter",
		);
	});

	it("completes a real billed request for a valid workspace-backed key", async () => {
		const seeded = await seedWorkspace({
			balanceNanos: 50_000_000_000,
		});

		const response = await sendGatewayRequest(seeded.apiKey, {
			model: SUCCESS_MODEL,
			input: "Reply with exactly: OK",
			max_output_tokens: 32,
			usage: true,
			meta: true,
		});

		const payload = await response.json();
		if (!response.ok) {
			throw new Error(
				`Expected success for ${SUCCESS_MODEL}, got ${response.status}: ${JSON.stringify(payload)}`,
			);
		}

		expect(payload?.object).toBe("response");
		expect(payload?.status).toBe("completed");
		expect(payload?.error ?? null).toBeNull();
		expect(typeof payload?.id).toBe("string");
		expect(Number(payload?.usage?.total_tokens ?? 0)).toBeGreaterThan(0);
	});
});
