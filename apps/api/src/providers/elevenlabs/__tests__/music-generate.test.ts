import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { exec } from "../endpoints/music-generate";

const REQUEST_META = {
	requestId: "req_test_music_el_1",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const PRICING_CARD = {
	provider: "elevenlabs",
	model: "test-model",
	endpoint: "music.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "requests",
			unit: "request",
			unit_size: 1,
			price_per_unit: 1,
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
	],
} as any;

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("ElevenLabs music.generate endpoint", () => {
	it("maps request fields and normalizes binary audio", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.elevenlabs.example/v1/music?output_format=pcm_44100",
				response: new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "Content-Type": "audio/pcm", "song-id": "el_job_123" },
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await exec({
			endpoint: "music.generate",
			model: "elevenlabs/music_v1",
			body: {
				model: "elevenlabs/music_v1",
				prompt: "Ambient piano with rain",
				duration: 12,
				format: "wav",
				elevenlabs: {
					model_id: "music_v2",
					force_instrumental: true,
					custom_option: "keep-this",
				},
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody?.model_id).toBe("music_v2");
		expect(capturedBody?.music_length_ms).toBe(12000);
		expect(capturedBody?.custom_option).toBe("keep-this");
		expect(result.normalized?.id).toBe("el_job_123");
		expect(result.normalized?.status).toBe("completed");
		expect(result.normalized?.content_type).toBe("audio/pcm");
	});

	it("handles binary responses as completed music", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.elevenlabs.example/v1/music?output_format=mp3_44100_128",
				response: new Response(new Uint8Array([1, 2, 3, 4]), {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
						"song-id": "el_binary_1",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await exec({
			endpoint: "music.generate",
			model: "elevenlabs/music_v1",
			body: {
				model: "elevenlabs/music_v1",
				prompt: "Short upbeat melody",
				format: "mp3",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.status).toBe("completed");
		expect(typeof result.normalized?.audio_base64).toBe("string");
		expect(capturedBody?.model_id).toBe("music_v2");
		expect(capturedBody?.with_timestamps).toBeUndefined();
	});

	it("rejects timestamp requests instead of silently returning plain audio", async () => {
		const mock = installFetchMock([]);
		const result = await exec({
			endpoint: "music.generate",
			model: "elevenlabs/music_v2",
			body: {
				model: "elevenlabs/music_v2",
				prompt: "Ambient strings",
				elevenlabs: { with_timestamps: true },
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "music_v2",
			stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({
			error: { param: "with_timestamps" },
		});
		expect(mock.calls).toHaveLength(0);
	});

	it.each([
		{ label: "composition plan", elevenlabs: { composition_plan: { sections: [] } }, param: "composition_plan" },
		{ label: "seed", elevenlabs: { seed: 42 }, param: "seed" },
	])("rejects prompt combined with ElevenLabs $label", async ({ elevenlabs, param }) => {
		const mock = installFetchMock([]);
		const result = await exec({
			endpoint: "music.generate",
			model: "elevenlabs/music_v2",
			body: {
				model: "elevenlabs/music_v2",
				prompt: "Ambient strings",
				elevenlabs,
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "music_v2",
			stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({ error: { param } });
		expect(mock.calls).toHaveLength(0);
	});

	it("maps OGG requests to ElevenLabs Opus output", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.elevenlabs.example/v1/music?output_format=opus_48000_128",
			response: new Response(new Uint8Array([1, 2, 3]), {
				status: 200,
				headers: { "Content-Type": "audio/ogg" },
			}),
		}]);

		const result = await exec({
			endpoint: "music.generate",
			model: "elevenlabs/music_v2",
			body: { model: "elevenlabs/music_v2", prompt: "Ambient strings", format: "ogg" },
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "music_v2",
			stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.content_type).toBe("audio/ogg");
	});

	it("rejects AAC rather than silently returning MP3", async () => {
		const result = await exec({
			endpoint: "music.generate",
			model: "elevenlabs/music_v2",
			body: { model: "elevenlabs/music_v2", prompt: "Ambient strings", format: "aac" },
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "music_v2",
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({ error: { param: "format" } });
	});
});

describe("ElevenLabs music billing without music_length_ms", () => {
	// Production: music_v2 priced on output_audio_seconds, $0.15 per 60 seconds.
	const card = {
		provider: "elevenlabs", model: "elevenlabs/music_v2", endpoint: "music.generate",
		effective_from: null, effective_to: null, currency: "USD", version: null,
		rules: [{ meter: "output_audio_seconds", unit: "second", unit_size: 60, price_per_unit: "0.15", currency: "USD", pricing_plan: "standard", note: null, match: [], priority: 100 }],
	} as any;

	const run = async (body: Record<string, unknown>, query: string, audio: Uint8Array, contentType: string) => {
		const mock = installFetchMock([{
			match: (url) => url === `https://api.elevenlabs.example/v1/music${query}`,
			response: new Response(audio, { status: 200, headers: { "Content-Type": contentType } }),
		}]);
		try {
			return await exec({
				endpoint: "music.generate", model: "elevenlabs/music_v2",
				body: { model: "elevenlabs/music_v2", prompt: "Calm piano", ...body },
				meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs", byokMeta: [],
				pricingCard: card, providerModelSlug: "music_v2", stream: false,
			} as any);
		} finally {
			mock.restore();
		}
	};

	it("bills the length of raw PCM audio", async () => {
		// 30 s of 16-bit mono PCM at 44.1 kHz.
		const result = await run({ elevenlabs: { output_format: "pcm_44100" } }, "?output_format=pcm_44100", new Uint8Array(44_100 * 2 * 30), "audio/pcm");
		expect(result.bill.usage.output_audio_seconds).toBe(30);
		// Before: no output_audio_seconds, so $0.
		expect(result.bill.usage.pricing.total_nanos).toBe(75_000_000);
	});

	it("bills MP3 audio from its bitrate when the frames cannot be parsed", async () => {
		// 240,000 bytes at mp3_44100_128 (16,000 bytes a second) is 15 s.
		const result = await run({ format: "mp3" }, "?output_format=mp3_44100_128", new Uint8Array(240_000), "audio/mpeg");
		expect(result.bill.usage.output_audio_seconds).toBe(15);
		expect(result.bill.usage.pricing.total_nanos).toBe(37_500_000);
	});

	it("keeps billing the requested length when the client sets one", async () => {
		const result = await run({ duration: 45 }, "", new Uint8Array(1_000), "audio/mpeg");
		expect(result.bill.usage.output_audio_seconds).toBe(45);
	});
});
