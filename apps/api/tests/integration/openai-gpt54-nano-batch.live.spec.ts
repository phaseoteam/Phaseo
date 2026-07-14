import { beforeAll, describe, expect, it } from "vitest";
import {
	LIVE_RUN,
	assertOk,
	getGateway,
	postJson,
	requireGatewayApiKey,
	sleep,
} from "./live-gateway.helpers";

const LIVE_OPENAI_BATCH_GPT54_NANO_RUN =
	(process.env.LIVE_OPENAI_BATCH_GPT54_NANO_RUN ?? "0").trim() === "1";
const describeLive = LIVE_RUN && LIVE_OPENAI_BATCH_GPT54_NANO_RUN ? describe : describe.skip;

const MODEL = (process.env.LIVE_OPENAI_BATCH_GPT54_NANO_MODEL ?? "openai/gpt-5.4-nano").trim();
const POLL_ATTEMPTS = Number(process.env.LIVE_OPENAI_BATCH_GPT54_NANO_POLL_ATTEMPTS ?? "120");
const POLL_DELAY_MS = Number(process.env.LIVE_OPENAI_BATCH_GPT54_NANO_POLL_DELAY_MS ?? "30000");
const PROMPT_COUNT = Number(process.env.LIVE_OPENAI_BATCH_GPT54_NANO_PROMPT_COUNT ?? "2");
const TERMINAL_STATES = new Set(["completed", "failed", "expired", "cancelled", "canceled"]);

function makePrompts(count: number): string[] {
	return Array.from({ length: Math.max(1, count) }, (_, index) => (
		`Reply with exactly JSON: {"ok":true,"index":${index + 1}}`
	));
}

async function pollBatch(batchId: string): Promise<any> {
	let latest: any = null;
	for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
		const result = await getGateway(`/batches/${encodeURIComponent(batchId)}`);
		assertOk(result, `/batches/${batchId}`);
		if (!("json" in result)) throw new Error("Expected JSON response from /batches/:id");
		latest = result.json;
		const status = String(latest?.status ?? "").trim().toLowerCase();
		console.log(
			`[openai-gpt54-nano-batch] poll ${attempt}/${POLL_ATTEMPTS} batch=${batchId} status=${status || "unknown"}`,
		);
		if (TERMINAL_STATES.has(status)) return latest;
		if (attempt < POLL_ATTEMPTS) await sleep(POLL_DELAY_MS);
	}
	return latest;
}

describeLive("OpenAI GPT-5.4 Nano live batch", () => {
	beforeAll(() => {
		requireGatewayApiKey();
	}, 30_000);

	it(
		"creates a model-first batch and polls every 30 seconds until terminal",
		async () => {
			const create = await postJson("/batches", {
				model: MODEL,
				prompts: makePrompts(PROMPT_COUNT),
				system: "Return only the requested JSON. No markdown.",
				max_tokens: 48,
				completion_window: "24h",
				session_id: `live_openai_gpt54_nano_batch_${Date.now()}`,
				metadata: {
					test: "openai-gpt54-nano-batch",
				},
			});
			assertOk(create, "/batches");
			if (!("json" in create)) throw new Error("Expected JSON response from /batches");
			expect(typeof create.json?.id).toBe("string");
			expect(String(create.json?.provider ?? "")).toBe("openai");
			expect(String(create.json?.status ?? "").length).toBeGreaterThan(0);
			expect(String(create.json?.input_file_id ?? "").length).toBeGreaterThan(0);

			const batchId = String(create.json.id);
			console.log(`[openai-gpt54-nano-batch] created batch=${batchId} status=${create.json.status}`);

			const latest = await pollBatch(batchId);
			const status = String(latest?.status ?? "").trim().toLowerCase();
			expect(status, `batch ${batchId} should complete successfully`).toBe("completed");
			expect(String(latest?.output_file_id ?? "").length, "completed batch should include output_file_id")
				.toBeGreaterThan(0);
			expect(Array.isArray(latest?.pricing_lines), "completed batch should include pricing lines").toBe(true);
			expect(latest?.billing && typeof latest.billing === "object", "completed batch should include billing").toBe(true);
		},
		Math.max(120_000, (POLL_ATTEMPTS * POLL_DELAY_MS) + 120_000),
	);
});
