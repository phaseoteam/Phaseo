// Purpose: Every end-to-end case, plus the families the harness cannot drive offline and why.
// Why: SUMMARY.md must say what was not covered as clearly as what was.
// How: Concatenates the case files; NOT_COVERED is reported verbatim.

import type { CaseDef } from "../types";
import { nonTextCases } from "./nontext";
import { textCases } from "./text";

export function allCases(): CaseDef[] {
	const cases = [...textCases(), ...nonTextCases()];
	const seen = new Set<string>();
	for (const def of cases) {
		if (seen.has(def.id)) throw new Error(`e2e harness: duplicate case id ${def.id}`);
		seen.add(def.id);
	}
	return cases;
}

export const NOT_COVERED: Array<{ area: string; reason: string }> = [
	{
		area: "Batches (/v1/batches) and files (/v1/files)",
		reason: "Not built with makeEndpointHandler (the registry maps them to runNotImplementedPipeline); the batch routes own their own credential, reservation and job-store modules. Create-request mapping is already exercised with module mocks in src/routes/v1/data/batches.gateway-smoke.test.ts, so this harness does not duplicate it.",
	},
	{
		area: "Realtime and live sessions (/v1/realtime, audio.realtime)",
		reason: "Needs a WebSocket upgrade and the session Durable Object; there is no request/response pair for the finaliser to settle, so it cannot be driven through makeEndpointHandler offline.",
	},
	{
		area: "Music generation",
		reason: "music.generate persists job metadata (core/music-jobs) and its priced routes (ElevenLabs, Lyria) return provider-specific binary or long-running payloads that need their own writers; not attempted in this pass.",
	},
	{
		area: "Video completion and download",
		reason: "Only submission runs through the pipeline; completion is polled by routes/v1/data/videos.ts and settled by core/video-finalization outside makeEndpointHandler.",
	},
	{
		area: "Parse (/v1/parse), decisions (/v1/decisions)",
		reason: "Not in the requested family list for this pass; both run through the same non-text and decisions runners and can be added with a writer each.",
	},
	{
		area: "Response cache hits, guardrail blocking, auto-router (phaseo/auto)",
		reason: "getResponseCache() returns null in this build, guardrails need workspace guardrail rows, and the auto-router needs benchmark data; the harness uses an empty guardrail policy and never requests phaseo/auto.",
	},
];
