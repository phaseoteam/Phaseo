import { describe, expect, it } from "vitest";
import { DecisionsSchema } from "../schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { filterDecisionCandidatesByModalities } from "@pipeline/execute/modalities";
import type { ProviderCandidate } from "@pipeline/before/types";

const body = { model: "cloudflare/clef-omni", questions: [{ type: "predicate", instructions: "Safe?" }] };
describe("Decision media inputs", () => {
	it("retains mixed evidence and its order in SystemOne and native formats", () => {
		const input = [{ role: "user", content: [
			{ type: "input_audio", input_audio: { data: "AQID", format: "mp3" } },
			{ type: "input_video", video_url: { url: "https://media.example/clip.mp4" } },
			{ type: "input_text", text: "Review both." },
		] }];
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ ...body, input }));
		expect(ir.audio).toEqual([{ type: "audio", source: "data", data: "AQID", format: "mp3" }]);
		expect(ir.videos).toEqual(["https://media.example/clip.mp4"]);
		expect(ir.state).toEqual([{ role: "user", content: "[Audio 0]\n[Video 0]\nReview both." }]);
		expect(ir.decisionContext?.input).toEqual(input);
	});
	it.each([
		{ type: "input_audio", input_audio: { data: "AQID" } },
		{ type: "input_audio", input_audio: { data: "AQID", format: "wav", url: "https://media.example/a" } },
		{ type: "input_audio", input_audio: { data: "!invalid!", format: "wav" } },
		{ type: "input_video", video_url: "file:///secret" },
		{ type: "input_video", video_url: "data:audio/wav;base64,AQID" },
	])("rejects malformed and ambiguous media: %j", part => {
		expect(DecisionsSchema.safeParse({ ...body, input: [{ role: "user", content: [part] }] }).success).toBe(false);
	});
	it("requires all advertised modalities and explicit capabilities", () => {
		const omni = { providerId: "cloudflare", inputModalities: ["text", "audio", "video"],
			capabilityParams: { audio: true, videos: true } } as ProviderCandidate;
		const undeclared = { ...omni, capabilityParams: {} };
		const luna = { providerId: "openai", inputModalities: ["text", "image"], capabilityParams: { images: true } } as ProviderCandidate;
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ ...body, input: [{ role: "user", content: [
			{ type: "input_audio", input_audio: { data: "AQID", format: "wav" } },
			{ type: "input_video", video_url: "data:video/mp4;base64,AQID" },
		] }] }));
		expect(filterDecisionCandidatesByModalities([omni, undeclared, luna], ir)).toEqual([omni]);
		expect(filterDecisionCandidatesByModalities([luna], ir)).toEqual([]);
		expect(filterDecisionCandidatesByModalities([luna], { ...ir, audio: [], videos: [] })).toEqual([luna]);
	});
});
