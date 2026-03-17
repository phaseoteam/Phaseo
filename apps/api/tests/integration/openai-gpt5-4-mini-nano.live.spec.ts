import { beforeAll, describe, expect, it } from "vitest";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

const MODELS = [
	"openai/gpt-5.4-mini",
	"openai/gpt-5.4-nano",
] as const;
const REASONING_EFFORTS = ["low", "high"] as const;

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);

function resolveGatewayUrl(path: string): string {
	const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
	const suffix = path.startsWith("/") ? path : `/${path}`;
	return `${base}${suffix}`;
}

async function runSimpleResponsesPrompt(
	model: string,
	reasoningEffort: (typeof REASONING_EFFORTS)[number],
): Promise<any> {
	const maxOutputTokens = reasoningEffort === "high" ? 128 : 32;

	const response = await fetch(resolveGatewayUrl("/responses"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${GATEWAY_API_KEY}`,
		},
		body: JSON.stringify({
			model,
			input: "Reply with exactly: OK",
			max_output_tokens: maxOutputTokens,
			reasoning: { effort: reasoningEffort },
			usage: true,
			meta: true,
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Gateway ${response.status} ${response.statusText}: ${text}`);
	}

	return response.json();
}

async function runEnabledReasoningPrompt(model: string): Promise<any> {
	const response = await fetch(resolveGatewayUrl("/responses"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${GATEWAY_API_KEY}`,
		},
		body: JSON.stringify({
			model,
			input: "Reply with exactly: OK",
			max_output_tokens: 128,
			reasoning: { enabled: true },
			usage: true,
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
			},
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Gateway ${response.status} ${response.statusText}: ${text}`);
	}

	return response.json();
}

describe("Live OpenAI GPT-5.4 mini/nano gateway smoke", () => {
	beforeAll(() => {
		if (!GATEWAY_API_KEY) {
			throw new Error("GATEWAY_API_KEY is required for live tests");
		}
	});

	for (const model of MODELS) {
		for (const effort of REASONING_EFFORTS) {
			it(`calls ${model} via /responses with reasoning effort ${effort}`, async () => {
				const result = await runSimpleResponsesPrompt(model, effort);
				expect(result?.id).toBeDefined();
				expect(result?.object).toBe("response");
				expect(result?.status).toBe("completed");
				expect(result?.error ?? null).toBeNull();
			}, 30_000);
		}
	}

	for (const model of MODELS) {
		it(`maps reasoning.enabled=true to medium effort for ${model}`, async () => {
			const result = await runEnabledReasoningPrompt(model);
			expect(result?.id).toBeDefined();
			expect(result?.object).toBe("response");
			expect(result?.status).toBe("completed");
			expect(result?.error ?? null).toBeNull();

			const upstreamRequestRaw = result?.upstream_request;
			expect(typeof upstreamRequestRaw).toBe("string");
			const upstreamRequest =
				typeof upstreamRequestRaw === "string" && upstreamRequestRaw.trim().length > 0
					? JSON.parse(upstreamRequestRaw)
					: null;
			expect(upstreamRequest?.reasoning?.effort).toBe("medium");
		}, 30_000);
	}
});
