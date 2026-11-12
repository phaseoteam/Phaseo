import { describe, expect, it } from "vitest";
import type { IRDecisionsRequest } from "@core/ir";
import { decodeNaceDecisionResponse, encodeNaceDecisionRequest } from "./decision-codec";

const request: IRDecisionsRequest = {
	model: "nace/drex-max",
	state: { ticket: "Please refund this charge" },
	questions: {
		refund: { type: "noul", instructions: "Refund requested?" },
		category: { type: "choice", instructions: "Category?", criteria: { billing: null, account: "Login issues" } },
		urgency: { type: "score", instructions: "Urgency?", criteria: ["Low", "High"] },
	},
};
const response = () => ({
	model: "drex-max", request_id: "req_test", evaluation_time_ms: 142.6,
	answers: {
		refund: { type: "noul", noul: 0.98 },
		category: { type: "choice", choice: "billing", confidence: 0.96, probabilities: { billing: 0.99, account: 0.01 } },
		urgency: { type: "score", score: 0.3, legend: ["Low", "High"], confidence: 0.7, probabilities: { "0": 0.7, "1": 0.3 } },
	},
	usage: { input_tokens: 106, output_tokens: 212, image_tokens: 20 },
});

describe("Nace decision IR", () => {
	it.each(["image/png", "image/jpeg", "image/webp"] as const)("translates structured %s images from the shared IR", (content_type) => {
		const body = encodeNaceDecisionRequest({ ...request, images: [{ content_type, base64: "YQ==" }] });
		expect(body.images).toEqual([`data:${content_type};base64,YQ==`]);
	});
	it("rejects contradictory scores while allowing independently rounded values", () => {
		const invalid = response();
		invalid.answers.urgency.score = 0.8;
		expect(() => decodeNaceDecisionResponse(invalid, request)).toThrow("inconsistent");
		const rounded = response();
		rounded.answers.urgency.score = 0.3001;
		expect(() => decodeNaceDecisionResponse(rounded, request)).not.toThrow();
	});
	it("maps typed questions and preserves JSON state and inline images", () => {
		const body = encodeNaceDecisionRequest({ ...request, images: ["data:image/png;base64,YQ=="] });
		expect(body.model).toBe("drex-max");
		expect(body.questions.refund.type).toBe("noul");
		expect(body.state).toEqual(request.state);
		expect(body.images).toEqual(["data:image/png;base64,YQ=="]);
	});
	it("preserves fractional scores, separate confidence and inclusive image usage", () => {
		const decoded = decodeNaceDecisionResponse(response(), request);
		expect(decoded.answers.refund).toEqual({ type: "noul", noul: 0.98 });
		expect(decoded.answers.category).toMatchObject({ confidence: 0.96, probabilities: { billing: 0.99 } });
		expect(decoded.answers.urgency).toMatchObject({ score: 0.3 });
		expect(decoded.usage).toEqual({ inputTokens: 106, outputTokens: 212, totalTokens: 318, _ext: { inputImageTokens: 20 } });
	});
	it("rejects model substitution, remote images and unsupported image models", () => {
		expect(() => encodeNaceDecisionRequest({ ...request, model: "nace/drex-latest" })).toThrow();
		expect(() => encodeNaceDecisionRequest({ ...request, images: ["https://example.com/a.png"] })).toThrow();
		expect(() => encodeNaceDecisionRequest({ ...request, model: "nace/drex-v2.0", images: ["YQ=="] })).toThrow();
	});
	it("enforces Max question and option limits and valid boolean questions", () => {
		expect(() => encodeNaceDecisionRequest({ ...request, questions: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [String(i), request.questions.refund])) })).toThrow();
		expect(() => encodeNaceDecisionRequest({ ...request, questions: { q: { type: "score", instructions: "Rate", criteria: Array(256).fill("level") } } })).toThrow();
		expect(() => encodeNaceDecisionRequest({ ...request, questions: { q: { type: "noul", instructions: "" } } })).toThrow();
	});
	it("rejects incomplete answers and malformed usage", () => {
		const missing = response();
		Reflect.deleteProperty(missing.answers, "refund");
		expect(() => decodeNaceDecisionResponse(missing, request)).toThrow();
		expect(() => decodeNaceDecisionResponse({ ...response(), usage: { input_tokens: -1, output_tokens: 0 } }, request)).toThrow();
		expect(() => decodeNaceDecisionResponse({ ...response(), model: "drex-v2.0" }, request)).toThrow();
	});
	it("rejects invented labels and broken distributions", () => {
		const invalid = response();
		invalid.answers.category.choice = "invented";
		expect(() => decodeNaceDecisionResponse(invalid, request)).toThrow();
		invalid.answers.category.choice = "billing";
		invalid.answers.category.probabilities.billing = 0.1;
		expect(() => decodeNaceDecisionResponse(invalid, request)).toThrow();
	});
	it("enforces body limits and accepts the larger text-only question batch", () => {
		expect(() => encodeNaceDecisionRequest({ ...request, state: "a".repeat(4 * 1024 * 1024) })).toThrow("4 MiB");
		const batch = Object.fromEntries(Array.from({ length: 512 }, (_, i) => [String(i), request.questions.refund]));
		expect(Object.keys(encodeNaceDecisionRequest({ ...request, model: "nace/drex-v2.0", questions: batch }).questions)).toHaveLength(512);
	});
	it("rejects incomplete distributions, mismatched scales and invalid image accounting", () => {
		const invalid = response();
		Reflect.deleteProperty(invalid.answers.category.probabilities, "account");
		expect(() => decodeNaceDecisionResponse(invalid, request)).toThrow();
		const scale = response();
		scale.answers.urgency.legend.reverse();
		expect(() => decodeNaceDecisionResponse(scale, request)).toThrow();
		const usage = response();
		usage.usage.image_tokens = 107;
		expect(() => decodeNaceDecisionResponse(usage, request)).toThrow();
	});
});
