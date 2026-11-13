import { describe, expect, it } from "vitest";
import { decisionQuestionLimit, filterDecisionCandidatesByModalities } from "./modalities";

describe("decisions feature routing", () => {
	const jev13 = { providerId: "typesafe", inputModalities: ["text", "image"], capabilityParams: { images: true, long_context: true } };
	const jev14 = { ...jev13, capabilityParams: { ...jev13.capabilityParams, box: true } };
	const openai = { providerId: "openai", inputModalities: ["text", "image"], capabilityParams: { images: true } };
	const base = { model: "model", state: "Photo", questions: {}, images: ["data:image/png;base64,AQID"] };
	it("routes Box only to an advertised Box capability with images", () => {
		const ir = { ...base, questions: { mug: { type: "box" as const, instructions: "The mug" } } };
		expect(filterDecisionCandidatesByModalities([jev13, jev14, openai] as any, ir)).toEqual([jev14]);
		expect(filterDecisionCandidatesByModalities([jev14] as any, { ...ir, images: [] })).toEqual([]);
	});
	it("routes Locate only to capabilities that declare locate", () => {
		const decider13 = { providerId: "perplexity", inputModalities: ["text", "image"], capabilityParams: { locate: true } };
		const decider12 = { providerId: "perplexity", inputModalities: ["text", "image"], capabilityParams: {} };
		const declined = { ...decider12, capabilityParams: { locate: false } };
		const text = { model: "model", state: "Email help@brewco.example", images: [], questions: {
			email: { type: "locate" as const, instructions: "email address" },
			defect: { type: "noul" as const, instructions: "Defect?" },
		} };
		expect(filterDecisionCandidatesByModalities([decider12, decider13, declined, openai] as any, text)).toEqual([decider13]);
		expect(filterDecisionCandidatesByModalities([decider12, openai] as any, text)).toEqual([]);
		const noLocate = { ...text, questions: { defect: text.questions.defect } };
		expect(filterDecisionCandidatesByModalities([decider12, decider13] as any, noLocate)).toEqual([decider12, decider13]);
	});
	it("routes hosted image URLs only to capabilities that fetch them", () => {
		const baseten = { providerId: "baseten", inputModalities: ["text", "image"], capabilityParams: { images: true, image_urls: true } };
		const candidates = [jev13, openai, baseten] as any;
		expect(filterDecisionCandidatesByModalities(candidates, { ...base, images: ["https://bucket.s3.amazonaws.com/a.png"] })).toEqual([baseten]);
		expect(filterDecisionCandidatesByModalities(candidates, base)).toEqual(candidates);
	});
	it("limits questions per route, defaulting to 128 where a route declares none", () => {
		const gemini = { providerId: "google-ai-studio", inputModalities: ["text"], capabilityParams: { max_questions: 1000 } };
		const clef = { providerId: "cloudflare", inputModalities: ["text"], capabilityParams: { max_questions: 64 } };
		const undeclared = { providerId: "openai", inputModalities: ["text"], capabilityParams: {} };
		const candidates = [gemini, clef, undeclared] as any;
		const ask = (count: number) => ({ model: "model", state: "Text", images: [], questions: Object.fromEntries(
			Array.from({ length: count }, (_, index) => [`q${index}`, { type: "noul" as const, instructions: "Safe?" }])) });
		expect(filterDecisionCandidatesByModalities(candidates, ask(64))).toEqual(candidates);
		expect(filterDecisionCandidatesByModalities(candidates, ask(65))).toEqual([gemini, undeclared]);
		expect(filterDecisionCandidatesByModalities(candidates, ask(128))).toEqual([gemini, undeclared]);
		expect(filterDecisionCandidatesByModalities(candidates, ask(129))).toEqual([gemini]);
		expect(filterDecisionCandidatesByModalities(candidates, ask(1000))).toEqual([gemini]);
		expect(filterDecisionCandidatesByModalities([clef, undeclared] as any, ask(129))).toEqual([]);
		expect(filterDecisionCandidatesByModalities([clef, undeclared] as any, ask(129), { ignoreQuestionLimit: true })).toEqual([clef, undeclared]);
		const mug = { ...ask(65), images: ["data:image/png;base64,AQID"], questions: { mug: { type: "box" as const, instructions: "The mug" } } };
		expect(filterDecisionCandidatesByModalities([gemini, clef] as any, mug, { ignoreQuestionLimit: true })).toEqual([]);
	});
	it("reads a route's question limit from max_questions and ignores invalid values", () => {
		expect(decisionQuestionLimit({ capabilityParams: { max_questions: 1000 } })).toBe(1000);
		expect(decisionQuestionLimit({ capabilityParams: { max_questions: 5000 } })).toBe(1000);
		for (const max_questions of [0, -1, 1.5, "1000", null, undefined, true]) {
			expect(decisionQuestionLimit({ capabilityParams: { max_questions } })).toBe(128);
		}
		expect(decisionQuestionLimit({ capabilityParams: undefined })).toBe(128);
	});
	it("requires TypeSafe long-context support only when enabled", () => {
		const candidates = [jev13, openai] as any;
		expect(filterDecisionCandidatesByModalities(candidates, { ...base, providerOptions: { typesafe: { long_context: true } } })).toEqual([jev13]);
		expect(filterDecisionCandidatesByModalities(candidates, { ...base, providerOptions: { typesafe: { long_context: false } } })).toEqual(candidates);
		expect(filterDecisionCandidatesByModalities([{ ...jev13, capabilityParams: { images: true } }] as any,
			{ ...base, providerOptions: { typesafe: { long_context: true } } })).toEqual([]);
	});
});
