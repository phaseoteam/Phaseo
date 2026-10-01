import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { DecisionsSchema } from "@core/schemas";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const image = "data:image/png;base64,AQID";
const questions = {
	visible: { type: "noul", instructions: "Is a defect visible?" },
	category: { type: "choice", instructions: "Which category?", criteria: { scratch: "Scratched", intact: "Intact" } },
	severity: { type: "score", instructions: "Rate damage.", criteria: ["None", "Severe"] },
};
const answers = {
	visible: { type: "noul", noul: 0.8 },
	category: { type: "choice", choice: "scratch", probabilities: { scratch: 0.8, intact: 0.2 }, confidence: 0.6 },
	severity: { type: "score", score: 0.8, probabilities: { "0": 0.2, "1": 0.8 }, legend: { "0": "None", "1": "Severe" }, confidence: 0.6 },
};
function argsFor(model = "clef", images?: ExecutorExecuteArgs["ir"]["images"]): ExecutorExecuteArgs {
	return {
		ir: decodeDecisionsRequest(DecisionsSchema.parse({ model: `cloudflare/${model}`, state: "Product photo", questions, images })),
		requestId: "req_clef", workspaceId: "test", providerId: "cloudflare", endpoint: "decisions",
		protocol: "phaseo.decisions", capability: "decisions.make", providerModelSlug: `@cf/cloudflare/${model}`,
		byokMeta: [], pricingCard: { rules: [] }, meta: { returnUpstreamRequest: true },
	};
}
const execute = resolveProviderExecutor("cloudflare", "decisions.make")!;
beforeEach(() => setupRuntimeFromEnv({ CLOUDFLARE_ACCOUNT_ID: "account-test", CLOUDFLARE_API_TOKEN: "cf-test" }));
afterEach(teardownTestRuntime);

describe("Cloudflare Clef decisions", () => {
	it.each(["clef", "clef-flash"])("maps %s to native System One, unwraps the envelope, and bills actual usage", async model => {
		const mock = installFetchMock([{ match: url => url.endsWith(`/ai/run/@cf/cloudflare/${model}`),
			response: jsonResponse({ success: true, result: { model, answers, usage: { input_tokens: 123, output_tokens: 0 } } }, { headers: { "cf-ray": "ray-test" } }) }]);
		try {
			const args = argsFor(model, [image, { content_type: "image/webp", base64: "AQID" }]);
			const result = await execute(args);
			expect(mock.calls[0].bodyJson).toEqual({ model, state: args.ir.state, questions, images: args.ir.images });
			expect(mock.calls[0].headers.Authorization).toBe("Bearer cf-test");
			expect(mock.calls[0].headers["cf-aig-gateway-id"]).toBe("default");
			expect(result.ir).toMatchObject({ model: `cloudflare/${model}`, answers, usage: { inputTokens: 123, outputTokens: 0 } });
			expect(result.bill.usage).toMatchObject({ input_tokens: 123, total_tokens: 123, requests: 1 });
			expect(result.bill.upstream_id).toBe("ray-test");
			expect(JSON.parse(result.mappedRequest!)).toEqual(mock.calls[0].bodyJson);
		} finally { mock.restore(); }
	});
	it("preserves text-only requests and uses BYOK or the forced managed key", async () => {
		const mock = installFetchMock([{ match: () => true, response: () => jsonResponse({ result: { answers, usage: { input_tokens: 10, output_tokens: 0 } } }) }]);
		try {
			const args = argsFor();
			args.byokMeta = [{ id: "byok-cf", key: "byok-test" }] as ExecutorExecuteArgs["byokMeta"];
			expect(await execute(args)).toMatchObject({ keySource: "byok", byokKeyId: "byok-cf" });
			expect(mock.calls[0].bodyJson).not.toHaveProperty("images");
			expect(mock.calls[0].headers.Authorization).toBe("Bearer byok-test");
			await execute({ ...args, meta: { forceGatewayKey: true } });
			expect(mock.calls[1].headers.Authorization).toBe("Bearer cf-test");
		} finally { mock.restore(); }
	});
	it.each([
		{ images: ["https://example.com/image.png"] },
		{ images: Array(5).fill(image) },
		{ images: [{ content_type: "image/gif", base64: "AQID" }] },
		{ images: [{ content_type: "image/png", base64: "!invalid!" }] },
		{ questions: { choice: { type: "choice", instructions: "Choose", criteria: { one: "One" } } } },
		{ questions: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`q${i}`, questions.visible])) },
		{ questions: { "invalid id": questions.visible } },
		{ questions: { score: { type: "score", instructions: "Rate", criteria: Array(11).fill("Level") } } },
	])("rejects unsupported input before an upstream call: %j", async override => {
		const mock = installFetchMock([]);
		try {
			const args = argsFor(); args.ir = { ...args.ir, ...override };
			const result = await execute(args);
			expect(result).toMatchObject({ terminal: true, localClientError: true });
			expect(result.upstream.status).toBe(400); expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each([
		{ answers: {}, usage: { input_tokens: 10, output_tokens: 0 } },
		{ answers, usage: { input_tokens: -1, output_tokens: 0 } },
		{ answers, usage: {} },
	])("rejects malformed typed answers or usage", async result => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse({ success: true, result }) }]);
		try { expect((await execute(argsFor())).upstream.status).toBe(502); } finally { mock.restore(); }
	});
	it("preserves upstream errors without charging usage", async () => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse({ success: false }, { status: 429, headers: { "Retry-After": "2" } }) }]);
		try {
			const result = await execute(argsFor());
			expect(result.upstream.status).toBe(429); expect(result.upstream.headers.get("Retry-After")).toBe("2");
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it("rejects oversized decoded image data without calling Cloudflare", async () => {
		const mock = installFetchMock([]);
		try {
			const args = argsFor();
			args.ir.images = [{ content_type: "image/png", base64: "AAAA".repeat(Math.ceil(4 * 1024 * 1024 / 3)) }];
			expect((await execute(args)).upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
});
