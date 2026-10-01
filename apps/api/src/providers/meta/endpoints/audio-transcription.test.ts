import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec } from "./audio-transcription";

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

function args(body: Record<string, unknown>) {
	return {
		endpoint: "audio.transcription",
		model: "meta/muse-voice-transcribe-1.0",
		body: { model: "meta/muse-voice-transcribe-1.0", file: new File(["audio"], "sample.wav", { type: "audio/wav" }), ...body },
		meta: { requestId: "req_meta_stt", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
		workspaceId: "team_test",
		providerId: "meta",
		byokMeta: [{ id: "byok-meta", key: "test-meta-key", alwaysUse: true }],
		pricingCard: null,
		providerModelSlug: "muse-voice-transcribe-1.0",
		stream: false,
	} as any;
}

describe("Meta Muse Voice transcription", () => {
	it("maps the OpenAI-compatible request to Meta's one-shot ASR endpoint", async () => {
		let form: FormData | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				if (url !== "https://api.meta.ai/v1/asr/transcribe?sessionId=session-1") return false;
				form = init?.body as FormData;
				return true;
			},
			response: jsonResponse({
				sessionId: "upstream-session",
				transcript: "Hello from Meta.",
				audioDurationMs: 2500,
				turns: [{ turnId: 0, speaker: "A", text: "Hello from Meta." }],
			}),
		}]);
		const result = await exec(args({ session_id: "session-1", language: "en", keywords: ["Phaseo"], diarize: true }));
		mock.restore();

		const request = JSON.parse(String(await (form!.get("request") as Blob).text()));
		expect(request).toEqual({
			mode: "DIARIZATION",
			model: "muse-voice-transcribe-1.0",
			audioEncoding: "WAV",
			keywords: ["Phaseo"],
			languageBias: ["en"],
		});
		expect(form!.get("audio")).toBeInstanceOf(File);
		expect(result.normalized).toMatchObject({
			text: "Hello from Meta.",
			duration: 2.5,
			usage: { requests: 1, input_audio_seconds: 2.5 },
		});
	});

	it("rejects streaming on the one-shot gateway surface", async () => {
		const result = await exec(args({ stream: true }));
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({ error: { param: "stream" } });
	});

	it("rejects non-WAV uploads before dispatch", async () => {
		const result = await exec(args({ file: new File(["audio"], "sample.mp3", { type: "audio/mpeg" }) }));
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({ error: { param: "file" } });
	});

	it.each([
		["file_url", "https://example.com/sample.wav"],
		["s3_presigned_url", "https://example.com/sample.wav"],
		["file_id", "file_123"],
		["context_bias", ["Phaseo"]],
		["output_content", "transcript"],
	] as const)("rejects unsupported %s instead of silently dropping it", async (parameter, value) => {
		const result = await exec(args({ [parameter]: value }));
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({ error: { param: parameter } });
	});
});
