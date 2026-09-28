import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

function buildArgs(overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir: {
			model: "respan/span-01:free",
			state: {
				input: [{ role: "user", content: "Please connect me to a person." }],
				output: { role: "assistant", content: "I will connect you to support." },
			},
			questions: {
				escalation: {
					type: "noul",
					instructions: "Does the assistant hand off the conversation to a human?",
					criteria: {
						true: "The assistant says a human handoff is needed.",
						false: "The assistant does not offer or confirm a human handoff.",
					},
				},
			},
		},
		requestId: "req_respan_decisions_test",
		workspaceId: "team_test",
		providerId: "respan",
		endpoint: "decisions",
		protocol: "phaseo.decisions",
		capability: "decisions.make",
		providerModelSlug: "span-01-free",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
		...overrides,
	} as ExecutorExecuteArgs;
}

beforeEach(() => setupRuntimeFromEnv({ RESPAN_API_KEY: "respan-test-key-value" } as any));
afterEach(teardownTestRuntime);

describe("Respan Span-01 Decisions executor", () => {
	it("maps Noul questions to behavior scores and preserves all probabilities", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.respan.ai/api/v1/scores",
			response: jsonResponse({
				model: "span-01-free",
				results: [{ id: "escalation", p_present: 0.73, p_absent: 0.25, p_not_observable: 0.02 }],
				usage: { input_tokens: 51 },
			}, { headers: { "x-respan-log-id": "score-log-123" } }),
		}]);

		try {
			const result = await executor(buildArgs({ meta: { echoUpstreamRequest: true } as any }));
			expect(mock.calls[0]?.method).toBe("POST");
			expect(mock.calls[0]?.headers.Authorization).toBe("Bearer respan-test-key-value");
			expect(mock.calls[0]?.bodyJson).toEqual({
				model: "span-01-free",
				span: {
					input: [{ role: "user", content: "Please connect me to a person." }],
					output: { role: "assistant", content: "I will connect you to support." },
				},
				behaviors: [{
					id: "escalation",
					definition: [
						"Behavior: Does the assistant hand off the conversation to a human?",
						"Present when: The assistant says a human handoff is needed.",
						"Absent when: The assistant does not offer or confirm a human handoff.",
					].join("\n"),
				}],
			});
			expect(result.kind).toBe("completed");
			expect(result.ir).toMatchObject({
				model: "respan/span-01:free",
				answers: {
					escalation: {
						type: "noul",
						noul: 0.73,
						probabilities: { true: 0.73, false: 0.25, not_observable: 0.02 },
					},
				},
				usage: { inputTokens: 51, outputTokens: 0, totalTokens: 51 },
			});
			expect(result.bill).toMatchObject({
				upstream_id: "score-log-123",
				usage: { input_tokens: 51, output_tokens: 0, total_tokens: 51 },
			});
		} finally {
			mock.restore();
		}
	});

	it("maps the canonical free catalog ID when no provider slug is supplied", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.respan.ai/api/v1/scores",
			response: jsonResponse({
				results: [{ id: "escalation", p_present: 0.6, p_absent: 0.3, p_not_observable: 0.1 }],
			}),
		}]);

		try {
			const result = await executor(buildArgs({ providerModelSlug: null }));
			expect(mock.calls[0]?.bodyJson).toMatchObject({ model: "span-01-free" });
			expect(result.kind).toBe("completed");
		} finally {
			mock.restore();
		}
	});

	it("routes span-01-pro and reports billable usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.respan.ai/api/v1/scores",
			response: jsonResponse({
				results: [{ id: "escalation", p_present: 0.2, p_absent: 0.7, p_not_observable: 0.1 }],
				usage: { input_tokens: 51 },
			}),
		}]);

		try {
			const result = await executor(buildArgs({
				ir: { ...(buildArgs().ir as any), model: "respan/span-01" } as any,
				providerModelSlug: "span-01-pro",
			}));
			expect(mock.calls[0]?.bodyJson).toMatchObject({ model: "span-01-pro" });
			expect(result.kind).toBe("completed");
			expect(result.ir).toMatchObject({ usage: { inputTokens: 51, outputTokens: 0, totalTokens: 51 } });
			expect(result.bill.usage).toEqual({
				requests: 1,
				input_tokens: 51,
				input_text_tokens: 51,
				output_tokens: 0,
				output_text_tokens: 0,
				total_tokens: 51,
			});
		} finally {
			mock.restore();
		}
	});

	it("fails closed when span-01-pro omits billable usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.respan.ai/api/v1/scores",
			response: jsonResponse({
				results: [{ id: "escalation", p_present: 0.2, p_absent: 0.7, p_not_observable: 0.1 }],
			}),
		}]);

		try {
			const result = await executor(buildArgs({
				ir: { ...(buildArgs().ir as any), model: "respan/span-01" } as any,
				providerModelSlug: "span-01-pro",
			}));
			expect(mock.calls[0]?.bodyJson).toMatchObject({ model: "span-01-pro" });
			expect(result.upstream.status).toBe(502);
			expect(await result.upstream.json()).toMatchObject({ error: "invalid_respan_span_response" });
			expect(result.ir).toBeUndefined();
			expect(result.bill.usage).toBeUndefined();
		} finally {
			mock.restore();
		}
	});

	it.each(["choice", "score"] as const)(
		"returns a clear unsupported-question error for %s before an upstream call",
		async (questionType) => {
			const mock = installFetchMock([]);
			try {
				const result = await executor(buildArgs({
					ir: {
						...(buildArgs().ir as any),
						questions: {
							segment: {
								type: questionType,
								instructions: "Pick a segment",
								criteria: { sales: "Sales" },
							},
						},
					} as any,
				}));
				expect(result.upstream.status).toBe(400);
				expect(result.localClientError).toBe(true);
				expect(await result.upstream.json()).toMatchObject({
					error: "unsupported_decision_request",
					message: `Respan Span-01 supports "noul" questions only; "choice" and "score" questions are not supported. Question "segment" uses "${questionType}".`,
					request_id: "req_respan_decisions_test",
				});
				expect(mock.calls).toHaveLength(0);
			} finally {
				mock.restore();
			}
		},
	);

	it("requires an explicit Respan span shape", async () => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(buildArgs({
				ir: { ...(buildArgs().ir as any), state: { ticket: "late delivery" } } as any,
			}));
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally {
			mock.restore();
		}
	});

	it("passes Respan access errors through without normalizing them to success", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.respan.ai/api/v1/scores",
			response: jsonResponse({ error: "Span-01 access is not enabled" }, { status: 403 }),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(403);
			expect(result.keySource).toBe("gateway");
		} finally {
			mock.restore();
		}
	});

	it("fails closed on missing, duplicate, or invalid behavior scores", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.respan.ai/api/v1/scores",
			response: jsonResponse({ results: [{ id: "escalation", p_present: 0.9, p_absent: 0.2, p_not_observable: 0.1 }] }),
		}]);

		try {
			const result = await executor(buildArgs());
			expect(result.upstream.status).toBe(502);
			expect(result.rawResponse).toMatchObject({ results: [{ id: "escalation" }] });
		} finally {
			mock.restore();
		}
	});
});
