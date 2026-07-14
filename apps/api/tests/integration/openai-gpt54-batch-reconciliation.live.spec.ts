import { beforeAll, describe, expect, it } from "vitest";
import {
	LIVE_RUN,
	GATEWAY_API_KEY,
	assertOk,
	getGateway,
	postJson,
	requireGatewayApiKey,
	sleep,
} from "./live-gateway.helpers";

const LIVE_OPENAI_BATCH_RECONCILIATION_RUN =
	(process.env.LIVE_OPENAI_BATCH_RECONCILIATION_RUN ?? "0").trim() === "1";
const describeLive = LIVE_RUN && LIVE_OPENAI_BATCH_RECONCILIATION_RUN ? describe : describe.skip;

const MODELS = [
	process.env.LIVE_OPENAI_BATCH_RECONCILIATION_NANO_MODEL ?? "openai/gpt-5.4-nano",
	process.env.LIVE_OPENAI_BATCH_RECONCILIATION_MINI_MODEL ?? "openai/gpt-5.4-mini",
].map((value) => value.trim()).filter(Boolean);

const DB_POLL_ATTEMPTS = Number(process.env.LIVE_OPENAI_BATCH_RECONCILIATION_DB_POLL_ATTEMPTS ?? "60");
const DB_POLL_DELAY_MS = Number(process.env.LIVE_OPENAI_BATCH_RECONCILIATION_DB_POLL_DELAY_MS ?? "30000");

type AsyncOperationRow = {
	workspace_id?: string;
	internal_id?: string;
	native_id?: string | null;
	model?: string | null;
	status?: string | null;
	billed_at?: string | null;
	meta?: Record<string, unknown> | null;
};

function normalizeEnv(value: string | undefined): string {
	return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function requireEnv(name: string): string {
	const value = normalizeEnv(process.env[name]);
	if (!value) throw new Error(`${name} is required for the live reconciliation smoke`);
	return value;
}

function parseGatewayKeyKid(value: string): string {
	const match = value.match(/^aistats_v1_sk_([^_]+)_/);
	if (!match?.[1]) throw new Error("Expected structured AI Stats API key");
	return match[1];
}

async function supabaseRest<T>(args: {
	pathname: string;
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}): Promise<T> {
	const supabaseUrl = normalizeEnv(process.env.SUPABASE_URL) || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
	const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
	const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${args.pathname.replace(/^\/+/, "")}`, {
		method: args.method ?? "GET",
		headers: {
			apikey: serviceRole,
			Authorization: `Bearer ${serviceRole}`,
			"Content-Type": "application/json",
			...(args.headers ?? {}),
		},
		body: args.body === undefined ? undefined : JSON.stringify(args.body),
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Supabase REST ${args.method ?? "GET"} ${args.pathname} failed (${response.status}): ${text}`);
	}
	return (text ? JSON.parse(text) : null) as T;
}

async function resolveWorkspaceIdFromGatewayKey(): Promise<string> {
	const kid = parseGatewayKeyKid(GATEWAY_API_KEY);
	const rows = await supabaseRest<Array<{ workspace_id?: string }>>({
		pathname: `keys?select=workspace_id&kid=eq.${encodeURIComponent(kid)}&limit=1`,
	});
	const workspaceId = String(rows[0]?.workspace_id ?? "").trim();
	if (!workspaceId) throw new Error("Could not resolve workspace_id for live gateway key");
	return workspaceId;
}

async function readAsyncOperation(workspaceId: string, batchId: string): Promise<AsyncOperationRow | null> {
	const rows = await supabaseRest<AsyncOperationRow[]>({
		pathname:
			`gateway_async_operations?select=workspace_id,internal_id,native_id,model,status,billed_at,meta` +
			`&workspace_id=eq.${encodeURIComponent(workspaceId)}` +
			`&kind=eq.batch` +
			`&internal_id=eq.${encodeURIComponent(batchId)}` +
			`&limit=1`,
	});
	return rows[0] ?? null;
}

async function waitForReconciledBilling(workspaceId: string, batchId: string): Promise<AsyncOperationRow> {
	let latest: AsyncOperationRow | null = null;
	for (let attempt = 1; attempt <= DB_POLL_ATTEMPTS; attempt += 1) {
		latest = await readAsyncOperation(workspaceId, batchId);
		const status = String(latest?.status ?? "").trim().toLowerCase();
		const billed = Boolean(latest?.billed_at);
		console.log(
			`[openai-gpt54-batch-reconciliation] db poll ${attempt}/${DB_POLL_ATTEMPTS} batch=${batchId} status=${status || "missing"} billed=${billed ? "yes" : "no"}`,
		);
		if (billed) return latest;
		if (attempt < DB_POLL_ATTEMPTS) await sleep(DB_POLL_DELAY_MS);
	}
	throw new Error(`Timed out waiting for reconciled billing on ${batchId}; latest=${JSON.stringify(latest)}`);
}

describeLive("OpenAI GPT-5.4 live batch reconciliation", () => {
	let workspaceId = "";

	beforeAll(async () => {
		requireGatewayApiKey();
		workspaceId = await resolveWorkspaceIdFromGatewayKey();
	}, 60_000);

	it(
		"bills nano and mini batches via reconciliation before result fetch",
		async () => {
			const created: Array<{ model: string; batchId: string }> = [];

			for (const model of MODELS) {
				const create = await postJson("/batches", {
					model,
					prompts: [`Reply with exactly JSON: {"model":"${model}","ok":true}`],
					system: "Return only the requested JSON. No markdown.",
					max_tokens: 32,
					completion_window: "24h",
					session_id: `live_openai_gpt54_reconcile_${model.replace(/[^a-z0-9]+/gi, "_")}_${Date.now()}`,
					metadata: {
						test: "openai-gpt54-batch-reconciliation",
						model,
					},
				});
				assertOk(create, "/batches");
				if (!("json" in create)) throw new Error("Expected JSON response from /batches");
				expect(String(create.json?.provider ?? "")).toBe("openai");
				expect(typeof create.json?.id).toBe("string");
				const batchId = String(create.json.id);
				created.push({ model, batchId });
				console.log(`[openai-gpt54-batch-reconciliation] created model=${model} batch=${batchId}`);
			}

			for (const { model, batchId } of created) {
				const reconciled = await waitForReconciledBilling(workspaceId, batchId);
				expect(reconciled.billed_at, `${model} ${batchId} should be billed by reconciliation`).toBeTruthy();
				expect(String(reconciled.status ?? "").toLowerCase()).toBe("completed");
				expect(String(reconciled.model ?? "") || String(reconciled.meta?.model ?? "")).toContain(model.replace(/^openai\//, ""));

				const latest = await getGateway(`/batches/${encodeURIComponent(batchId)}`);
				assertOk(latest, `/batches/${batchId}`);
				if (!("json" in latest)) throw new Error("Expected JSON response from /batches/:id");
				expect(String(latest.json?.status ?? "").toLowerCase()).toBe("completed");
				expect(Array.isArray(latest.json?.pricing_lines), `${model} should expose pricing lines`).toBe(true);
				expect(latest.json?.billing && typeof latest.json.billing === "object", `${model} should expose billing`).toBe(true);
				expect(latest.json?.billing?.billed, `${model} should report billed`).toBe(true);
				console.log(
					`[openai-gpt54-batch-reconciliation] verified model=${model} batch=${batchId} billed_at=${reconciled.billed_at}`,
				);
			}
		},
		Math.max(240_000, (DB_POLL_ATTEMPTS * DB_POLL_DELAY_MS) + 180_000),
	);
});
