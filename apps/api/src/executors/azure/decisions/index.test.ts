import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IRDecisionsRequest } from "@core/ir";
import { DecisionsSchema } from "@core/schemas";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { azureDecisionsUrl } from "@providers/azure/config";
import { computeBillSummary } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

const model = "microsoft/microsoft-decision-1";
const endpoint = "https://resource.services.ai.azure.com/providers/microsoft/v1/systemone";
const questions: IRDecisionsRequest["questions"] = {
	gate: { type: "noul", instructions: "Is it urgent?" },
	team: { type: "choice", instructions: "Which team?", criteria: { engineering: "Bugs", support: "Questions" } },
	severity: { type: "score", instructions: "Severity?", criteria: ["Low", "High"] },
};
const answers = {
	gate: { type: "noul", noul: 0.9 },
	team: { type: "choice", choice: "engineering", probabilities: { engineering: 0.9, support: 0.1 }, confidence: 0.9 },
	severity: { type: "score", score: 0.9, probabilities: { "0": 0.1, "1": 0.9 }, confidence: 0.9 },
};
const payload = () => ({ model: "microsoft-decision-1", answers, usage: { input_tokens: 120, output_tokens: 3 } });
function argsFor(ir: Partial<IRDecisionsRequest> = {}): ExecutorExecuteArgs {
	return {
		ir: { model, state: { message: "The API is down." }, questions, ...ir },
		requestId: "req_decision", workspaceId: "ws_test", providerId: "azure",
		providerModelSlug: "phaseo-decision-1", endpoint: "decisions", protocol: "phaseo.decisions",
		capability: "decisions.make", byokMeta: [], pricingCard: { rules: [] }, meta: { returnUpstreamRequest: true },
	};
}
beforeEach(() => setupRuntimeFromEnv({ AZURE_OPENAI_BASE_URL: "https://resource.openai.azure.com/openai/v1", AZURE_OPENAI_API_KEY: "azure-test" }));
afterEach(teardownTestRuntime);

describe("Azure Microsoft Decision", () => {
	it("registers the existing decision capability and alias", () => {
		expect(resolveProviderExecutor("azure", "decisions.make")).toBe(executor);
		expect(resolveProviderExecutor("azure", "systemone")).toBe(executor);
	});
	it.each([
		"https://resource.openai.azure.com/openai/v1",
		"https://resource.services.ai.azure.com/",
		"https://resource.services.ai.azure.com/providers/microsoft/v1?api-version=preview",
	])("builds the native resource endpoint from %s", base => {
		expect(azureDecisionsUrl(base)).toBe(endpoint);
	});
	it("preserves text/JSON evidence and all answer types while billing actual tokens", async () => {
		const mock = installFetchMock([{ match: url => url === endpoint, response: jsonResponse(payload(), { headers: { "x-request-id": "azure-response" } }) }]);
		try {
			const args = argsFor();
			const result = await executor(args);
			expect(mock.calls[0]).toMatchObject({ method: "POST", headers: { "api-key": "azure-test" },
				bodyJson: { model: "phaseo-decision-1", state: args.ir.state, questions } });
			expect(mock.calls[0].headers.Authorization).toBeUndefined();
			expect(result.ir).toMatchObject({ model, answers, usage: { inputTokens: 120, outputTokens: 3, totalTokens: 123 } });
			expect(result.bill.upstream_id).toBe("azure-response");
			expect(JSON.parse(result.mappedRequest!)).toEqual(mock.calls[0].bodyJson);
			const card: PriceCard = { provider: "azure", model, endpoint: "decisions.make", currency: "USD", version: 2,
				effective_from: null, effective_to: null, rules: [
					{ meter: "input_text_tokens", price_per_unit: "0.042" },
					{ meter: "output_text_tokens", price_per_unit: "0" },
				].map(rule => ({ ...rule, unit: "token", unit_size: 1_000_000, currency: "USD", pricing_plan: "standard", match: [], priority: 100 })) };
			expect(computeBillSummary(result.bill.usage!, card, {}, "standard").cost_usd_str).toBe("0.000005040");
		} finally { mock.restore(); }
	});
	it("round-trips ordered native questions and boolean choices through the IR", async () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model, input: "Evidence", questions: [
			{ type: "predicate", name: "gate", instructions: "Urgent?" },
			{ type: "choice", name: "allowed", instructions: "Allowed?", choices: [{ value: true }, { value: false }] },
			{ type: "score", name: "severity", instructions: "Severity?", levels: [{ label: "Low" }, { label: "High" }] },
		] }));
		const mock = installFetchMock([{ match: url => url === endpoint, response: jsonResponse({ answers: {
			question_0: answers.gate,
			question_1: { type: "choice", choice: "0", probabilities: { "0": 0.9, "1": 0.1 }, confidence: 0.9 },
			question_2: answers.severity,
		}, usage: { input_tokens: 12, output_tokens: 3 } }) }]);
		try {
			const result = await executor({ ...argsFor(), ir });
			expect(mock.calls[0].bodyJson.questions).toEqual(ir.questions);
			expect(encodeDecisionsResponse(result.ir as any, ir).answers).toMatchObject([
				{ type: "predicate", name: "gate", probability: 0.9 },
				{ type: "choice", name: "allowed", choice: true },
				{ type: "score", name: "severity", score: 0.9 },
			]);
		} finally { mock.restore(); }
	});
	it("uses deployment overrides and resource-specific Entra credentials", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ AZURE_OPENAI_BASE_URL: "https://default.openai.azure.com", AZURE_OPENAI_API_KEY: "default-key",
			AZURE_OPENAI_DEPLOYMENTS: JSON.stringify({ [model]: { baseUrl: "https://resource.services.ai.azure.com", deployment: "custom-decision", authToken: "entra-test" } }) });
		const mock = installFetchMock([{ match: url => url === endpoint, response: jsonResponse(payload()) }]);
		try {
			await executor(argsFor());
			expect(mock.calls[0].bodyJson.model).toBe("custom-decision");
			expect(mock.calls[0].headers.Authorization).toBe("Bearer entra-test");
			expect(mock.calls[0].headers["api-key"]).toBeUndefined();
		} finally { mock.restore(); }
	});
	it("uses BYOK and honors forced managed credentials", async () => {
		const mock = installFetchMock([{ match: () => true, response: () => jsonResponse(payload()) }]);
		try {
			const args = argsFor(); args.byokMeta = [{ id: "byok-test", key: "byok-key" }] as any;
			expect(await executor(args)).toMatchObject({ keySource: "byok", byokKeyId: "byok-test" });
			expect(mock.calls[0].headers["api-key"]).toBe("byok-key");
			await executor({ ...args, meta: { forceGatewayKey: true } });
			expect(mock.calls[1].headers["api-key"]).toBe("azure-test");
		} finally { mock.restore(); }
	});
	it("does not reuse the default resource key for a different resource", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ AZURE_OPENAI_BASE_URL: "https://default.openai.azure.com", AZURE_OPENAI_API_KEY: "default-key",
			AZURE_OPENAI_DEPLOYMENTS: JSON.stringify({ [model]: { baseUrl: "https://other.services.ai.azure.com", deployment: "custom-decision" } }) });
		const mock = installFetchMock([]);
		try {
			await expect(executor(argsFor())).rejects.toMatchObject({ code: "azure_key_missing" });
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each([
		{ images: ["data:image/png;base64,eA=="] },
		{ state: ["Inspect", { type: "image_url", image_url: { url: "data:image/png;base64,eA==" } }] },
		{ audio: [{ type: "audio", source: "data", data: "eA==", format: "wav" }] },
		{ videos: ["https://example.com/video.mp4"] },
		{ rawRequest: { stream: true } }, { rawRequest: { tools: [] } },
		{ rawRequest: { tool_choice: "auto" } }, { rawRequest: { safety_identifier: "user" } },
		{ rawRequest: { service_tier: "fast" } },
		{ rawRequest: { temperature: 0 } }, { rawRequest: { top_p: 0.5 } },
		{ rawRequest: { max_tokens: 10 } }, { rawRequest: { max_output_tokens: 10 } },
		{ rawRequest: { max_completion_tokens: 10 } },
		{ rawRequest: { reasoning: { effort: "high" } } }, { rawRequest: { reasoning_effort: "high" } },
	] satisfies Partial<IRDecisionsRequest>[])("rejects unsupported requests without fetching: %j", async override => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(argsFor(override));
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400);
			expect(result.bill.usage).toBeUndefined();
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each([429, 401, 403, 404, 500])("preserves upstream %s and bills no usage", async status => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse({ error: { message: "Unavailable" } }, { status, headers: { "Retry-After": "1" } }) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(status);
			expect(result.upstream.headers.get("Retry-After")).toBe("1");
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it.each([
		{ answers, usage: { input_tokens: -1, output_tokens: 0 } },
		{ answers, usage: { input_tokens: "12", output_tokens: 0 } },
		{ answers: {}, usage: { input_tokens: 12, output_tokens: 0 } },
		{ answers: { ...answers, gate: { type: "noul", noul: 2 } }, usage: { input_tokens: 12, output_tokens: 0 } },
	])("fails closed on malformed answers or usage", async raw => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse(raw) }]);
		try {
			const result = await executor(argsFor());
			expect(result.upstream.status).toBe(502);
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
});
