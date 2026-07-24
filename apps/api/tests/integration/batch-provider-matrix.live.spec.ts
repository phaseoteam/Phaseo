import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	LIVE_RUN,
	GATEWAY_API_KEY,
	assertOk,
	getGateway,
	postJson,
	requireGatewayApiKey,
	resolveModelFromCatalog,
	sleep,
} from "./live-gateway.helpers";
import {
	createLiveBatchWebhookFixture,
	deleteLiveBatchWebhookFixture,
	hmacSha256Hex,
	normalizeLiveEnv,
	requireLiveEnv,
	resolveLiveWorkspaceId,
	supabaseAdminRest,
	waitForBatchWebhook,
	webhookHeader,
	type LiveBatchWebhookFixture,
} from "./batch-live-webhook.helpers";

const LIVE_BATCH_PROVIDER_MATRIX_RUN =
	(process.env.LIVE_BATCH_PROVIDER_MATRIX_RUN ?? "0").trim() === "1";
const describeLive = LIVE_RUN && LIVE_BATCH_PROVIDER_MATRIX_RUN ? describe : describe.skip;

const TERMINAL_STATES = new Set(["completed", "failed", "expired", "cancelled", "canceled"]);
const ALL_PROVIDERS = ["openai", "google-ai-studio", "anthropic", "mistral", "x-ai", "groq", "together"] as const;
const DEFAULT_PROVIDERS = ["openai", "google-ai-studio", "anthropic", "mistral"] as const;
const PROVIDERS = (process.env.LIVE_BATCH_PROVIDER_MATRIX_PROVIDERS ?? DEFAULT_PROVIDERS.join(","))
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
const DB_POLL_ATTEMPTS = Number(process.env.LIVE_BATCH_PROVIDER_MATRIX_DB_POLL_ATTEMPTS ?? "90");
const DB_POLL_DELAY_MS = Number(process.env.LIVE_BATCH_PROVIDER_MATRIX_DB_POLL_DELAY_MS ?? "30000");
const REQUEST_COUNT = Number(process.env.LIVE_BATCH_PROVIDER_MATRIX_REQUEST_COUNT ?? "1");
const WEBHOOK_POLL_ATTEMPTS = Number(process.env.LIVE_BATCH_PROVIDER_MATRIX_WEBHOOK_POLL_ATTEMPTS ?? "30");
const WEBHOOK_POLL_DELAY_MS = Number(process.env.LIVE_BATCH_PROVIDER_MATRIX_WEBHOOK_POLL_DELAY_MS ?? "5000");
const VERIFY_WEBHOOK = (process.env.LIVE_BATCH_PROVIDER_MATRIX_VERIFY_WEBHOOK ?? "1").trim() !== "0";

type ProviderId = typeof ALL_PROVIDERS[number];

type ProviderCase = {
	provider: ProviderId;
	envModel: string;
	preferredModels: string[];
	allowCatalogFallback?: boolean;
};

type AsyncOperationRow = {
	workspace_id?: string;
	internal_id?: string;
	native_id?: string | null;
	provider?: string | null;
	model?: string | null;
	status?: string | null;
	billed_at?: string | null;
	last_reconcile_error?: string | null;
	meta?: Record<string, unknown> | null;
};

type WalletReservationRow = {
	reservation_id?: string;
	amount_nanos?: number | string;
	status?: string;
	settled_amount_nanos?: number | string | null;
};

type GatewayChargeRow = {
	request_id?: string;
	cost_nanos?: number | string;
	status?: string;
};

const PROVIDER_CASES: ProviderCase[] = [
	{
		provider: "openai",
		envModel: "LIVE_BATCH_PROVIDER_MATRIX_OPENAI_MODEL",
		preferredModels: ["openai/gpt-5.4-nano", "openai/gpt-5-nano"],
	},
	{
		provider: "google-ai-studio",
		envModel: "LIVE_BATCH_PROVIDER_MATRIX_GEMINI_MODEL",
		preferredModels: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
	},
	{
		provider: "anthropic",
		envModel: "LIVE_BATCH_PROVIDER_MATRIX_ANTHROPIC_MODEL",
		preferredModels: [
			"anthropic/claude-haiku-4.5",
			"anthropic/claude-sonnet-4.6",
			"anthropic/claude-sonnet-4.5",
			"anthropic/claude-3.5-haiku",
		],
		allowCatalogFallback: false,
	},
	{
		provider: "x-ai",
		envModel: "LIVE_BATCH_PROVIDER_MATRIX_XAI_MODEL",
		preferredModels: ["spacex-ai/grok-4.3"],
	},
	{
		provider: "mistral",
		envModel: "LIVE_BATCH_PROVIDER_MATRIX_MISTRAL_MODEL",
		preferredModels: ["mistral/mistral-small-2603", "mistral/mistral-small-4"],
	},
	{
		provider: "groq",
		envModel: "LIVE_BATCH_PROVIDER_MATRIX_GROQ_MODEL",
		preferredModels: ["groq/llama-3.3-70b-versatile", "groq/llama-3.1-8b-instant"],
	},
	{
		provider: "together",
		envModel: "LIVE_BATCH_PROVIDER_MATRIX_TOGETHER_MODEL",
		preferredModels: ["together/meta-llama/Llama-3.3-70B-Instruct-Turbo"],
	},
];

async function readAsyncOperation(workspaceId: string, batchId: string): Promise<AsyncOperationRow | null> {
	const rows = await supabaseAdminRest<AsyncOperationRow[]>({
		pathname:
			`gateway_async_operations?select=workspace_id,internal_id,native_id,provider,model,status,billed_at,last_reconcile_error,meta` +
			`&workspace_id=eq.${encodeURIComponent(workspaceId)}` +
			`&kind=eq.batch` +
			`&internal_id=eq.${encodeURIComponent(batchId)}` +
			`&limit=1`,
	});
	return rows[0] ?? null;
}

async function readWalletReservation(workspaceId: string, reservationId: string): Promise<WalletReservationRow | null> {
	const rows = await supabaseAdminRest<WalletReservationRow[]>({
		pathname:
			`gateway_wallet_reservations?select=reservation_id,amount_nanos,status,settled_amount_nanos` +
			`&workspace_id=eq.${encodeURIComponent(workspaceId)}` +
			`&reservation_id=eq.${encodeURIComponent(reservationId)}` +
			`&limit=1`,
	});
	return rows[0] ?? null;
}

async function readBatchFallbackCharge(workspaceId: string, batchId: string): Promise<GatewayChargeRow | null> {
	const rows = await supabaseAdminRest<GatewayChargeRow[]>({
		pathname:
			`gateway_request_charges?select=request_id,cost_nanos,status` +
			`&workspace_id=eq.${encodeURIComponent(workspaceId)}` +
			`&request_id=eq.${encodeURIComponent(`batch_capture:${batchId}`)}` +
			`&limit=1`,
	});
	return rows[0] ?? null;
}

async function waitForBilledBatch(workspaceId: string, batchId: string, provider: string): Promise<AsyncOperationRow> {
	let latest: AsyncOperationRow | null = null;
	for (let attempt = 1; attempt <= DB_POLL_ATTEMPTS; attempt += 1) {
		latest = await readAsyncOperation(workspaceId, batchId);
		const status = String(latest?.status ?? "").trim().toLowerCase();
		const billed = Boolean(latest?.billed_at);
		const reason = String((latest?.meta as any)?.billingReason ?? (latest?.meta as any)?.billing_reason ?? "");
		const reconcileError = String(latest?.last_reconcile_error ?? "");
		console.log(
			`[batch-provider-matrix] provider=${provider} poll=${attempt}/${DB_POLL_ATTEMPTS} batch=${batchId} status=${status || "missing"} billed=${billed ? "yes" : "no"} reason=${reason || "none"}`,
		);
		if (billed) return latest;
		if (TERMINAL_STATES.has(status) && reconcileError) {
			throw new Error(`Batch ${batchId} reached ${status} but reconciliation is blocked: ${reconcileError}`);
		}
		if (TERMINAL_STATES.has(status) && reason.startsWith("batch_billing_blocked")) {
			throw new Error(`Batch ${batchId} reached ${status} but billing is blocked: ${reason}`);
		}
		if (attempt < DB_POLL_ATTEMPTS) await sleep(DB_POLL_DELAY_MS);
	}
	throw new Error(`Timed out waiting for ${provider} batch ${batchId} to be billed; latest=${JSON.stringify(latest)}`);
}

function promptItems(provider: string, model: string): string[] {
	return Array.from({ length: Math.max(1, REQUEST_COUNT) }, (_, index) =>
		`Return exactly JSON: {"provider":"${provider}","index":${index + 1},"ok":true}`,
	);
}

async function resolveLiveModel(testCase: ProviderCase): Promise<string> {
	const override = normalizeLiveEnv(process.env[testCase.envModel]);
	if (override) return override;
	const resolved = await resolveModelFromCatalog({
		preferredModelIds: testCase.preferredModels,
		providerId: testCase.provider,
	});
	if (testCase.allowCatalogFallback === false) {
		const preferred = new Set(testCase.preferredModels.map((model) => model.toLowerCase()));
		if (!preferred.has(resolved.toLowerCase())) {
			throw new Error(
				`No preferred ${testCase.provider} live Batch model is currently routable; refusing catalog fallback to ${resolved}`,
			);
		}
	}
	return resolved;
}

describeLive("Batch provider live matrix", () => {
	let workspaceId = "";
	let webhookFixture: LiveBatchWebhookFixture | null = null;

	beforeAll(async () => {
		requireGatewayApiKey();
		requireLiveEnv("SUPABASE_SERVICE_ROLE_KEY");
		workspaceId = await resolveLiveWorkspaceId();
		if (VERIFY_WEBHOOK) {
			webhookFixture = await createLiveBatchWebhookFixture(workspaceId);
			console.log(`[batch-provider-matrix] webhook receiver=${webhookFixture.receiverUrl} endpoint=${webhookFixture.endpointId}`);
		}
	}, 60_000);

	afterAll(async () => {
		if (webhookFixture?.endpointId) await deleteLiveBatchWebhookFixture(webhookFixture.endpointId);
	}, 60_000);

	for (const testCase of PROVIDER_CASES.filter((item) => PROVIDERS.includes(item.provider))) {
		describe(`${testCase.provider} batch`, () => {
		it(
			"creates, persists, reconciles, settles, exposes rows, and signs the terminal webhook",
			async () => {
				if (VERIFY_WEBHOOK && !webhookFixture) throw new Error("Managed webhook fixture was not created");
				const model = await resolveLiveModel(testCase);
				const create = await postJson("/batches", {
					model,
					prompts: promptItems(testCase.provider, model),
					system: "Return only the requested JSON. No markdown.",
					max_tokens: 48,
					completion_window: "24h",
					provider: testCase.provider,
					...(webhookFixture ? { webhook_endpoint_id: webhookFixture.endpointId } : {}),
					session_id: `live_batch_provider_matrix_${testCase.provider.replace(/[^a-z0-9]+/gi, "_")}_${Date.now()}`,
					metadata: {
						test: "batch-provider-matrix",
						provider: testCase.provider,
						model,
					},
				});
				assertOk(create, "/batches");
				if (!("json" in create)) throw new Error("Expected JSON response from /batches");
				expect(typeof create.json?.id).toBe("string");
				expect(String(create.json?.provider ?? "")).toBe(testCase.provider);
				expect(String(create.json?.status ?? "").length).toBeGreaterThan(0);
				const batchId = String(create.json.id);
				console.log(`[batch-provider-matrix] created provider=${testCase.provider} model=${model} batch=${batchId}`);
				const createdOperation = await readAsyncOperation(workspaceId, batchId);
				expect(createdOperation, `${testCase.provider} should persist the batch before returning`).not.toBeNull();
				expect(String(createdOperation?.native_id ?? "").length).toBeGreaterThan(0);
				expect(String(createdOperation?.provider ?? "")).toBe(testCase.provider);
				const reservationId = String((createdOperation?.meta as any)?.reservationId ?? "");
				expect(reservationId).toMatch(/^batch_hold:/);
				const initialReservation = await readWalletReservation(workspaceId, reservationId);
				expect(initialReservation, `${testCase.provider} should have a wallet hold`).not.toBeNull();
				expect(Number(initialReservation?.amount_nanos ?? 0)).toBeGreaterThan(0);
				expect(["held", "reserved", "captured"]).toContain(String(initialReservation?.status ?? ""));

				const reconciled = await waitForBilledBatch(workspaceId, batchId, testCase.provider);
				expect(reconciled.billed_at, `${testCase.provider} ${batchId} should be billed`).toBeTruthy();
				expect(String(reconciled.status ?? "").toLowerCase()).toBe("completed");
				const costNanos = Number((reconciled.meta as any)?.costNanos ?? 0);
				expect(costNanos, `${testCase.provider} should persist authoritative cost`).toBeGreaterThan(0);
				const settledReservation = await readWalletReservation(workspaceId, reservationId);
				const reservationStatus = String(settledReservation?.status ?? "");
				if (reservationStatus === "captured") {
					expect(Number(settledReservation?.settled_amount_nanos ?? -1)).toBe(costNanos);
				} else {
					expect(reservationStatus).toBe("released");
					const fallbackCharge = await readBatchFallbackCharge(workspaceId, batchId);
					expect(fallbackCharge, `${testCase.provider} should persist its fallback actual-cost charge`).not.toBeNull();
					expect(String(fallbackCharge?.status ?? "")).toBe("applied");
					expect(Number(fallbackCharge?.cost_nanos ?? -1)).toBe(costNanos);
				}

				const latest = await getGateway(`/batches/${encodeURIComponent(batchId)}`);
				assertOk(latest, `/batches/${batchId}`);
				if (!("json" in latest)) throw new Error("Expected JSON response from /batches/:id");
				expect(String(latest.json?.status ?? "").toLowerCase()).toBe("completed");
				expect(latest.json?.billing?.billed, `${testCase.provider} should report billed`).toBe(true);
				expect(Array.isArray(latest.json?.pricing_lines), `${testCase.provider} should expose pricing lines`).toBe(true);

				const rows = await getGateway(`/batches/${encodeURIComponent(batchId)}/requests?limit=10`);
				assertOk(rows, `/batches/${batchId}/requests`);
				if (!("json" in rows)) throw new Error("Expected JSON response from /batches/:id/requests");
				expect(Array.isArray(rows.json?.data), `${testCase.provider} should expose request rows`).toBe(true);
				expect(rows.json.data.length).toBeGreaterThanOrEqual(Math.max(1, REQUEST_COUNT));
				expect(rows.json.data.some((row: any) => String(row?.status ?? "").toLowerCase() === "completed"))
					.toBe(true);

				if (!VERIFY_WEBHOOK || !webhookFixture) return;
				const delivered = await waitForBatchWebhook({
					receiverToken: webhookFixture.receiverToken,
					batchId,
					eventType: "batch.completed",
					attempts: WEBHOOK_POLL_ATTEMPTS,
					delayMs: WEBHOOK_POLL_DELAY_MS,
				});
				expect(delivered, `${testCase.provider} should deliver batch.completed`).not.toBeNull();
				if (!delivered) return;
				const timestamp = webhookHeader(delivered, "x-phaseo-timestamp");
				const signature = webhookHeader(delivered, "x-phaseo-signature");
				expect(timestamp).toMatch(/^\d+$/);
				expect(signature).toBe(await hmacSha256Hex(webhookFixture.signingSecret, `${timestamp}.${delivered.content}`));
				const webhookPayload = JSON.parse(delivered.content);
				expect(webhookPayload).toMatchObject({
					id: expect.stringMatching(/^evt_batch_/),
					type: "batch.completed",
					data: { id: batchId, provider: testCase.provider, status: "completed" },
				});
			},
			Math.max(240_000, (DB_POLL_ATTEMPTS * DB_POLL_DELAY_MS) + (WEBHOOK_POLL_ATTEMPTS * WEBHOOK_POLL_DELAY_MS) + 180_000),
		);
		});
	}
});
