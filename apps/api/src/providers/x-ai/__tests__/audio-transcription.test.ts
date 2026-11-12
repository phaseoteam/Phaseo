import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec } from "../endpoints/audio-transcription";

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

function args(body: Record<string, unknown>) {
	return { endpoint: "audio.transcription", model: "spacex-ai/grok-transcribe", body: { model: "spacex-ai/grok-transcribe", file: new File(["audio"], "sample.mp3", { type: "audio/mpeg" }), ...body }, meta: { requestId: "req_xai_stt", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" }, workspaceId: "team_test", providerId: "x-ai", byokMeta: [], pricingCard: null, providerModelSlug: "grok-transcribe", stream: false } as any;
}

describe("xAI audio transcription", () => {
	it("posts xAI multipart fields before the file and maps duration usage", async () => {
		let form: FormData | undefined;
		const mock = installFetchMock([{ match: (url, init) => { if (url !== "https://api.x.ai/v1/stt") return false; form = init?.body as FormData; return true; }, response: jsonResponse({ text: "Phaseo costs $100.", language: "English", duration: 3.45, words: [{ text: "Phaseo", start: 0, end: 0.4 }] }) }]);
		const result = await exec(args({ language: "en", keywords: ["Phaseo"], diarize: true }));
		mock.restore();
		expect([...form!.keys()]).toEqual(["model", "format", "language", "diarize", "keyterm", "file"]);
		expect(form!.get("model")).toBe("grok-transcribe");
		expect(result.normalized).toMatchObject({ text: "Phaseo costs $100.", usage: { input_audio_seconds: 3.45, requests: 1 } });
		expect(result.bill.usage).toMatchObject({ input_audio_seconds: 3.45 });
	});

	it("sends grok-voice-transcribe-2.0 keyterms like grok-transcribe", async () => {
		let form: FormData | undefined;
		const mock = installFetchMock([{ match: (url, init) => { if (url !== "https://api.x.ai/v1/stt") return false; form = init?.body as FormData; return true; }, response: jsonResponse({ text: "ok", duration: 1 }) }]);
		const base = args({ keywords: ["Phaseo", "a".repeat(50)] });
		const result = await exec({ ...base, model: "spacex-ai/grok-voice-transcribe-2.0", providerModelSlug: "grok-voice-transcribe-2.0", body: { ...base.body, model: "spacex-ai/grok-voice-transcribe-2.0" } });
		mock.restore();
		expect(result.upstream.status).toBe(200);
		expect(form!.getAll("keyterm")).toEqual(["Phaseo", "a".repeat(50)]);
		expect(form!.get("model")).toBe("grok-voice-transcribe-2.0");
	});

	it("rejects OpenAI-only transcription controls", async () => {
		const result = await exec(args({ response_format: "verbose_json" }));
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({ error: { param: "response_format" } });
	});
});
