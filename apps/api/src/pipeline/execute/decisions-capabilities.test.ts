import { describe, expect, it } from "vitest";
import { filterDecisionCandidatesByModalities } from "./modalities";

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
	it("requires TypeSafe long-context support only when enabled", () => {
		const candidates = [jev13, openai] as any;
		expect(filterDecisionCandidatesByModalities(candidates, { ...base, providerOptions: { typesafe: { long_context: true } } })).toEqual([jev13]);
		expect(filterDecisionCandidatesByModalities(candidates, { ...base, providerOptions: { typesafe: { long_context: false } } })).toEqual(candidates);
		expect(filterDecisionCandidatesByModalities([{ ...jev13, capabilityParams: { images: true } }] as any,
			{ ...base, providerOptions: { typesafe: { long_context: true } } })).toEqual([]);
	});
});
