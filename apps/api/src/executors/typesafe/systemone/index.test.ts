import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { createUpstreamTimingTracker } from "@executors/_shared/timing/upstream";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { executor } from "./index";

function buildArgs(overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir: {
			model: "typesafe/jev-1.13.0",
			state: { plan: "pro", active_users: 42 },
			questions: {
				segment: {
					type: "choice",
					instructions: "Which segment is this account in?",
					criteria: { startup: "A small company.", enterprise: "A large company." },
				},
			},
		},
		requestId: "req_typesafe_systemone_test",
		workspaceId: "team_test",
		providerId: "typesafe",
		endpoint: "decisions",
		protocol: "phaseo.decisions",
		capability: "decisions.make",
		providerModelSlug: "jev-1.13.0",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
		...overrides,
	} as ExecutorExecuteArgs;
}

beforeEach(() => setupRuntimeFromEnv({ TYPESAFE_API_KEY: "typesafe-test-key" } as any));
afterEach(teardownTestRuntime);

describe("TypeSafe System One executor", () => {
	it.each([undefined, false, true])("maps images and long context headers (long context: %s)", async long_context => {
		const box = { top: 0.1, bottom: 0.8, left: 0.2, right: 0.9 };
		const mock = installFetchMock([{ match: url => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({ model: "jev-1.14.0", answers: { mug: { type: "box", box, confidence: 0.9 } }, usage: { input_tokens: 400, output_tokens: 21 } }),
		}]);
		try {
			const result = await executor(buildArgs({ providerModelSlug: "jev-1.14.0", ir: {
				model: "typesafe/jev-1.14.0", state: "Photo", images: ["data:image/png;base64,AQID"],
				questions: { mug: { type: "box", instructions: "The mug in images[0]" } },
				providerOptions: { typesafe: { long_context } },
			} }));
			expect(mock.calls[0].headers["TypeSafe-Danger-Zone-Images"]).toBe("true");
			expect(mock.calls[0].headers["TypeSafe-Danger-Zone-Long-Context"]).toBe(long_context === true ? "true" : undefined);
			const body = mock.calls[0].bodyJson as any;
			expect(body.state.images).toEqual(Object.keys(body.assets));
			expect(body.provider_options).toBeUndefined();
			expect(result.ir).toMatchObject({ answers: { mug: { box, confidence: 0.9 } } });
			expect(result.bill.usage).toMatchObject({ input_tokens: 400, output_tokens: 21 });
			expect(result.bill.usage?.input_text_tokens).toBeUndefined();
		} finally { mock.restore(); }
	});
	it("rejects Box on Jev 1.13 before making an upstream call", async () => {
		const result = await executor(buildArgs({ ir: { state: "Photo", images: ["data:image/png;base64,AQID"],
			questions: { mug: { type: "box", instructions: "The mug" } } } }));
		expect(result.upstream.status).toBe(400);
		expect(result.localClientError).toBe(true);
	});
	// BoxAnswer.confidence is "Null when the model does not provide confidence" (https://docs.typesafe.ai/api).
	it("accepts and returns a Box answer with null confidence", async () => {
		const box = { top: 0.2, bottom: 0.66, left: 0.19, right: 0.68 };
		const mock = installFetchMock([{ match: url => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({ model: "jev-1.14.0", answers: { red_rectangle: { type: "box", box, confidence: null } }, usage: { input_tokens: 285, output_tokens: 20 } }),
		}]);
		try {
			const result = await executor(buildArgs({ providerModelSlug: "jev-1.14.0", ir: { model: "typesafe/jev-1.14.0", state: "Photo", images: ["data:image/png;base64,AQID"], questions: { red_rectangle: { type: "box", instructions: "The red rectangle" } } } }));
			expect(result.upstream.status).toBe(200);
			expect(result.ir).toMatchObject({ answers: { red_rectangle: { type: "box", box, confidence: null } } });
			expect(result.bill.usage).toMatchObject({ input_tokens: 285, output_tokens: 20 });
		} finally { mock.restore(); }
	});
	it.each([null, 0.9])("returns Box confidence %s through the public decisions response", (confidence) => {
		const box = { top: 0.2, bottom: 0.66, left: 0.19, right: 0.68 };
		const request = decodeDecisionsRequest(DecisionsSchema.parse({
			model: "typesafe/jev-1.14.0",
			input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AQID" }] }],
			questions: [{ type: "box", name: "red_rectangle", instructions: "The red rectangle" }],
		}));
		const response = encodeDecisionsResponse({ model: "typesafe/jev-1.14.0", answers: { question_0: { type: "box", box, confidence } } } as any, request);
		expect(response.answers).toEqual([{ type: "box", name: "red_rectangle", box, confidence }]);
	});
	it("still rejects a choice answer with null confidence", async () => {
		const mock = installFetchMock([{ match: url => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({ answers: { segment: { type: "choice", choice: "startup", probabilities: { startup: 0.7, enterprise: 0.3 }, confidence: null } }, usage: { input_tokens: 40, output_tokens: 2 } }),
		}]);
		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(502);
		} finally { mock.restore(); }
	});
	it("rejects malformed Box responses without billing", async () => {
		const mock = installFetchMock([{ match: url => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({ answers: { mug: { type: "box", box: { top: 0.8, bottom: 0.1, left: 0.2, right: 0.9 }, confidence: 0.9 } }, usage: { input_tokens: 400, output_tokens: 21 } }),
		}]);
		try {
			const result = await executor(buildArgs({ providerModelSlug: "jev-1.14.0", ir: { model: "typesafe/jev-1.14.0", state: "Photo", images: ["data:image/png;base64,AQID"], questions: { mug: { type: "box", instructions: "The mug" } } } }));
			expect(result.upstream.status).toBe(502);
			expect(result.bill.usage).toBeUndefined();
		} finally { mock.restore(); }
	});
	it("posts the keyed question map and normalizes usage", async () => {
		const upstreamTracker = createUpstreamTimingTracker();
		const mock = installFetchMock([{
			match: (url) => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({
				model: "jev-1.13.0",
				answers: { segment: { type: "choice", choice: "startup", confidence: 0.94, probabilities: { startup: 0.94, enterprise: 0.06 } } },
				usage: { input_tokens: 120, output_tokens: 0 },
			}),
		}]);

		try {
			const result = await executor(buildArgs({ upstreamTiming: upstreamTracker.timing }));
			expect(mock.calls[0]?.method).toBe("POST");
			expect(mock.calls[0]?.headers.Authorization).toBe("Bearer typesafe-test-key");
			expect(mock.calls[0]?.headers["TypeSafe-Danger-Zone-Images"]).toBeUndefined();
			expect(mock.calls[0]?.headers["TypeSafe-Danger-Zone-Long-Context"]).toBeUndefined();
			expect(mock.calls[0]?.bodyJson).toEqual({
				model: "jev-1.13.0",
				state: { plan: "pro", active_users: 42 },
				questions: {
					segment: {
						type: "choice",
						instructions: "Which segment is this account in?",
						criteria: { startup: "A small company.", enterprise: "A large company." },
					},
				},
			});
			expect(result.kind).toBe("completed");
			expect(result.ir).toMatchObject({
				model: "typesafe/jev-1.13.0",
				answers: { segment: { choice: "startup", confidence: 0.94 } },
				usage: { inputTokens: 120, outputTokens: 0, totalTokens: 120 },
			});
			expect(result.bill.usage).toMatchObject({
				requests: 1,
				input_tokens: 120,
				output_tokens: 0,
				total_tokens: 120,
			});
			expect(result.timing).toEqual({
				latencyMs: expect.any(Number),
				generationMs: expect.any(Number),
			});
			expect(result.timing?.latencyMs).toBe(result.timing?.generationMs);
			expect(upstreamTracker.snapshot().upstreamRequestCount).toBe(1);
		} finally {
			mock.restore();
		}
	});

	it("preserves TypeSafe error responses for the gateway error handler", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.typesafe.ai/v1/systemone",
			response: jsonResponse({ error: "rate_limited" }, { status: 429 }),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(429);
			expect(result.keySource).toBe("gateway");
			expect(result.bill.cost_cents).toBe(0);
		} finally {
			mock.restore();
		}
	});
});
