import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { encodeDecisionsResponse } from "@protocols/decisions/encode";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { executor } from "./index";

const URL_V1BETA = "https://generativelanguage.googleapis.com/v1beta/decisions";

const questions = {
	wants_summary: { type: "noul", instructions: "Does the user want a summary?" },
	action: { type: "choice", instructions: "Pick the action.", criteria: { refund: null, replace: "Ship a new unit." } },
	severity: { type: "score", instructions: "Rate severity.", criteria: ["Low", "Medium", "High"] },
};

function buildArgs(ir: Record<string, unknown> = {}, overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "google-ai-studio/decisions-prerelease", state: "Complaint text", questions, ...ir },
		requestId: "req_google_decisions",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "decisions",
		protocol: "phaseo.decisions",
		capability: "decisions.make",
		providerModelSlug: "decisions-prerelease",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: {},
		...overrides,
	} as unknown as ExecutorExecuteArgs;
}

const googleResponse = {
	answers: {
		wants_summary: { type: "noul", noul: 0.95, confidence: 0.95 },
		action: { type: "choice", choice: "refund", confidence: 0.7, probabilities: { refund: 0.7, replace: 0.3 } },
		severity: {
			type: "score", score: 1.1, confidence: 0.5,
			legend: { 0: "Low", 1: "Medium", 2: "High" }, probabilities: { 0: 0.3, 1: 0.5, 2: 0.2 },
		},
	},
	usage: { total_input_tokens: 120, total_output_tokens: 3, total_tokens: 123 },
};

beforeEach(() => setupRuntimeFromEnv({ GOOGLE_AI_STUDIO_API_KEY: "google-test-key" } as any));
afterEach(teardownTestRuntime);

async function run(args: ExecutorExecuteArgs, response: Response = jsonResponse(googleResponse)) {
	const mock = installFetchMock([{ match: () => true, response }]);
	try {
		return { result: await executor(args), mock };
	} finally {
		mock.restore();
	}
}

describe("Google AI Studio Decisions executor", () => {
	it("posts a text input and all three question types with x-goog-api-key", async () => {
		const { result, mock } = await run(buildArgs({}, { meta: { echoUpstreamRequest: true } as any }));
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0].url).toBe(URL_V1BETA);
		expect(mock.calls[0].method).toBe("POST");
		expect(mock.calls[0].headers["x-goog-api-key"]).toBe("google-test-key");
		expect(mock.calls[0].headers.Authorization).toBeUndefined();
		expect(mock.calls[0].url).not.toContain("key=");
		expect(mock.calls[0].bodyJson).toEqual({
			model: "decisions-prerelease",
			input: "Complaint text",
			questions: {
				wants_summary: { type: "noul", instructions: "Does the user want a summary?" },
				// A null description becomes a blank one, which Google reads as "no description".
				action: { type: "choice", instructions: "Pick the action.", criteria: { refund: "", replace: "Ship a new unit." } },
				severity: { type: "score", instructions: "Rate severity.", criteria: ["Low", "Medium", "High"] },
			},
		});
		expect((result as any).mappedRequest).toBe(JSON.stringify(mock.calls[0].bodyJson));
		expect(result.upstream.status).toBe(200);
		expect(result.ir).toMatchObject({
			model: "google-ai-studio/decisions-prerelease",
			answers: googleResponse.answers,
			usage: { inputTokens: 120, outputTokens: 3, totalTokens: 123 },
		});
		expect(result.bill.usage).toEqual({
			requests: 1, input_tokens: 120, input_text_tokens: 120, output_tokens: 3, output_text_tokens: 3, total_tokens: 123,
		});
	});

	it("serializes JSON state and maps noul true/false criteria", async () => {
		const { mock } = await run(buildArgs({
			state: { order: 1 },
			questions: { q: { type: "noul", instructions: "Late?", criteria: { true: "Over 5 days", false: "On time" } } },
		}), jsonResponse({ answers: { q: { type: "noul", noul: 0.4, confidence: 0.6 } }, usage: googleResponse.usage }));
		expect(mock.calls[0].bodyJson.input).toBe(JSON.stringify({ order: 1 }));
		expect(mock.calls[0].bodyJson.questions.q).toEqual({
			type: "noul", instructions: "Late?", criteria: { true_description: "Over 5 days", false_description: "On time" },
		});
	});

	it("adds thought tokens to output tokens", async () => {
		const { result } = await run(buildArgs(), jsonResponse({
			...googleResponse, usage: { total_input_tokens: 100, total_output_tokens: 2, total_thought_tokens: 5, total_tokens: 107 },
		}));
		expect(result.bill.usage).toMatchObject({ input_tokens: 100, output_tokens: 7, total_tokens: 107 });
	});

	it("does not duplicate /v1beta when the base URL already has it", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ GOOGLE_AI_STUDIO_API_KEY: "google-test-key", GOOGLE_AI_STUDIO_BASE_URL: "https://proxy.example/v1beta/" } as any);
		const { mock } = await run(buildArgs());
		expect(mock.calls[0].url).toBe("https://proxy.example/v1beta/decisions");
	});

	it("sends images, audio and video as ordered content blocks and keeps audio out of the text meter", async () => {
		const { result, mock } = await run(buildArgs({
			images: [{ content_type: "image/png", base64: "AQID" }, "data:image/jpeg;base64,BAUG"],
			audio: [{ type: "audio", source: "data", data: "BwgJ", format: "wav" }, { type: "audio", source: "url", data: "https://example.com/a.mp3" }],
			videos: ["https://example.com/v.mp4"],
			questions: { q: { type: "noul", instructions: "Anything?" } },
		}), jsonResponse({ answers: { q: { type: "noul", noul: 0.5, confidence: 0.5 } }, usage: { total_input_tokens: 900, total_output_tokens: 0 } }));
		expect(mock.calls[0].bodyJson.input).toEqual([
			{ type: "text", text: "Complaint text" },
			{ type: "image", data: "AQID", mime_type: "image/png" },
			{ type: "image", data: "BAUG", mime_type: "image/jpeg" },
			{ type: "audio", data: "BwgJ", mime_type: "audio/wav" },
			{ type: "audio", uri: "https://example.com/a.mp3" },
			{ type: "video", uri: "https://example.com/v.mp4" },
		]);
		expect(result.bill.usage).toEqual({ requests: 1, input_tokens: 900, output_tokens: 0, output_text_tokens: 0, total_tokens: 900 });
	});

	it("maps native evidence in order and answers the native format", async () => {
		const native = decodeDecisionsRequest(DecisionsSchema.parse({
			model: "google-ai-studio/decisions-prerelease",
			input: [{ role: "user", content: [
				{ type: "input_text", text: "Is this damaged?" },
				{ type: "input_image", image_url: "data:image/png;base64,AQID", detail: "original" },
				{ type: "input_image", image_url: "https://example.com/b.png", detail: "low" },
				{ type: "input_audio", input_audio: { data: "BwgJ", format: "mp3" } },
			] }],
			questions: [
				{ type: "predicate", instructions: "Damaged?" },
				{ type: "choice", instructions: "Which part?", choices: [{ value: "screen", description: "Display" }, { value: "case" }] },
			],
		}));
		const { result, mock } = await run(buildArgs(native as unknown as Record<string, unknown>), jsonResponse({
			answers: {
				question_0: { type: "noul", noul: 0.9, confidence: 0.9 },
				question_1: { type: "choice", choice: "0", confidence: 0.8, probabilities: { 0: 0.8, 1: 0.2 } },
			},
			usage: { total_input_tokens: 500, total_output_tokens: 0 },
		}));
		expect(mock.calls[0].bodyJson.input).toEqual([
			{ type: "text", text: "Is this damaged?" },
			{ type: "image", data: "AQID", mime_type: "image/png", resolution: "ultra_high" },
			{ type: "image", uri: "https://example.com/b.png", resolution: "low" },
			{ type: "audio", data: "BwgJ", mime_type: "audio/mp3" },
		]);
		expect(mock.calls[0].bodyJson.questions.question_1).toEqual({
			type: "choice", instructions: "Which part?", criteria: { 0: "screen: Display", 1: "case" },
		});
		const payload = encodeDecisionsResponse(result.ir as any, native);
		expect(payload.answers[0]).toMatchObject({ type: "predicate", name: null, probability: 0.9 });
		expect(payload.answers[1]).toMatchObject({ type: "choice", choice: "screen", confidence: 0.8 });
	});

	describe("rejects locally, without calling Google", () => {
		it.each([
			["a box question", { questions: { q: { type: "box", instructions: "Where?" } } }, {}, /box/],
			["an unsupported control", { rawRequest: { temperature: 0.2 } }, {}, /temperature/],
			["a safety identifier", { rawRequest: { safety_identifier: "user-1" } }, {}, /safety_identifier/],
			["a choice with one option", { questions: { q: { type: "choice", instructions: "Pick", criteria: { only: null } } } }, {}, /2 to 255 options/],
			["a choice with 256 options", { questions: { q: { type: "choice", instructions: "Pick", criteria: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`o${i}`, null])) } } }, {}, /2 to 255 options/],
			["an option with surrounding whitespace", { questions: { q: { type: "choice", instructions: "Pick", criteria: { " a": null, b: null } } } }, {}, /whitespace/],
			["a score with one level", { questions: { q: { type: "score", instructions: "Rate", criteria: ["Only"] } } }, {}, /2 to 255 non-empty levels/],
			["a score with a blank level", { questions: { q: { type: "score", instructions: "Rate", criteria: ["Low", " "] } } }, {}, /non-empty levels/],
			["blank instructions", { questions: { q: { type: "noul", instructions: "  " } } }, {}, /needs instructions/],
			["an http image URL", { images: ["http://example.com/a.png"] }, {}, /HTTPS/],
			["inline PCM audio", { audio: [{ type: "audio", source: "data", data: "AAAA", format: "pcm16" }] }, {}, /format/],
		])("%s", async (_name, ir, overrides, message) => {
			const { result, mock } = await run(buildArgs(ir as Record<string, unknown>, overrides as Partial<ExecutorExecuteArgs>));
			expect(mock.calls).toHaveLength(0);
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "unsupported_decision_request", message: expect.stringMatching(message) });
			expect(result).toMatchObject({ terminal: true, localClientError: true });
		});

		it("a missing provider model", async () => {
			const { result, mock } = await run(buildArgs({}, { providerModelSlug: "" }));
			expect(mock.calls).toHaveLength(0);
			expect(result.upstream.status).toBe(400);
		});
	});

	it("turns a blocked input into a content-policy client error and bills nothing", async () => {
		const { result } = await run(buildArgs(), jsonResponse({
			prompt_feedback: { block_reason: "prohibited_content", block_reason_message: "Input blocked." },
		}));
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({
			error: "content_policy_violation", message: "Input blocked.", block_reason: "prohibited_content", request_id: "req_google_decisions",
		});
		expect(result.ir).toBeUndefined();
		expect(result.bill).toMatchObject({ cost_cents: 0 });
		expect(result.bill.usage).toBeUndefined();
	});

	it("passes a Google error status through", async () => {
		const { result } = await run(buildArgs(), jsonResponse({ error: { code: 429, message: "Quota" } }, { status: 429, headers: { "x-request-id": "g_1" } }));
		expect(result.upstream.status).toBe(429);
		expect(result.ir).toBeUndefined();
		expect(result.bill).toMatchObject({ upstream_id: "g_1" });
	});

	describe("returns a 502 instead of a bad answer", () => {
		it.each([
			["a choice distribution that does not sum to 1", { ...googleResponse.answers, action: { ...googleResponse.answers.action, probabilities: { refund: 0.7, replace: 0.7 } } }],
			["a choice outside the options", { ...googleResponse.answers, action: { ...googleResponse.answers.action, choice: "exchange" } }],
			["a score above the top level", { ...googleResponse.answers, severity: { ...googleResponse.answers.severity, score: 3 } }],
			["an answer of the wrong type", { ...googleResponse.answers, wants_summary: googleResponse.answers.action }],
			["a probability above 1", { ...googleResponse.answers, wants_summary: { type: "noul", noul: 1.4, confidence: 0.6 } }],
			["an unknown answer type", { ...googleResponse.answers, wants_summary: { type: "other" } }],
			["a missing answer", { wants_summary: googleResponse.answers.wants_summary }],
		])("%s", async (_name, answers) => {
			const { result } = await run(buildArgs(), jsonResponse({ answers, usage: googleResponse.usage }));
			expect(result.upstream.status).toBe(502);
			expect(await result.upstream.json()).toMatchObject({ error: "invalid_decisions_response" });
			expect(result.ir).toBeUndefined();
		});

		it.each([
			["usage is missing", { answers: googleResponse.answers }],
			["input tokens are missing", { answers: googleResponse.answers, usage: { total_output_tokens: 1 } }],
			["token counts are negative", { answers: googleResponse.answers, usage: { total_input_tokens: -1, total_output_tokens: 1 } }],
			["thought tokens are malformed", { answers: googleResponse.answers, usage: { ...googleResponse.usage, total_thought_tokens: "3" } }],
		])("when %s", async (_name, payload) => {
			const { result } = await run(buildArgs(), jsonResponse(payload));
			expect(result.upstream.status).toBe(502);
			expect(result.ir).toBeUndefined();
		});
	});
});
