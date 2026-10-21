import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { exec } from "./audio-speech";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

const PRICING_CARD = {
	provider: "mistral",
	model: "mistral/voxtral-tts-3",
	endpoint: "audio.speech",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [{
		meter: "input_characters",
		unit: "character",
		unit_size: 1000,
		price_per_unit: 0.016,
		currency: "USD",
		pricing_plan: "standard",
		match: [],
		priority: 100,
		effective_from: null,
		effective_to: null,
	}],
} as any;

function args(body: Record<string, unknown>) {
	return {
		endpoint: "audio.speech",
		model: "mistral/voxtral-tts-3",
		body,
		meta: {},
		workspaceId: "team_test",
		providerId: "mistral",
		providerModelSlug: "voxtral-mini-tts-3-0",
		byokMeta: [],
		pricingCard: PRICING_CARD,
		stream: false,
	} as any;
}

async function errorOf(result: Awaited<ReturnType<typeof exec>>) {
	expect(result.kind).toBe("completed");
	if (result.kind !== "completed") throw new Error("expected completed result");
	return { status: result.upstream.status, body: await result.upstream.clone().json() as any, cost: result.bill.cost_cents };
}

describe("Mistral audio speech endpoint", () => {
	it("maps voice to voice_id, decodes base64 audio, and bills input characters", async () => {
		let sent: Record<string, unknown> | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				sent = JSON.parse(String(init?.body));
				return url.endsWith("/v1/audio/speech");
			},
			response: jsonResponse({ audio_data: btoa("RIFFfake-audio") }),
		}]);

		const result = await exec(args({
			model: "mistral/voxtral-tts-3",
			input: "a".repeat(1000),
			voice: "preset-voice",
			response_format: "wav",
		}));
		mock.restore();

		expect(sent).toEqual({
			model: "voxtral-mini-tts-3-0",
			input: "a".repeat(1000),
			response_format: "wav",
			stream: false,
			voice_id: "preset-voice",
		});
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") {
			expect(result.upstream.status).toBe(200);
			expect(result.upstream.headers.get("content-type")).toBe("audio/wav");
			expect(await result.upstream.text()).toBe("RIFFfake-audio");
			expect((result.bill.usage as any).pricing.total_nanos).toBe(16_000_000);
		}
	});

	it("defaults to mp3 when no format is given", async () => {
		let sent: Record<string, unknown> | undefined;
		const mock = installFetchMock([{
			match: (_url, init) => {
				sent = JSON.parse(String(init?.body));
				return true;
			},
			response: jsonResponse({ audio_data: btoa("ID3") }),
		}]);

		const result = await exec(args({ model: "mistral/voxtral-tts-3", input: "Hello", voice: "preset-voice" }));
		mock.restore();

		expect(sent?.response_format).toBe("mp3");
		if (result.kind === "completed") {
			expect(result.upstream.headers.get("content-type")).toBe("audio/mpeg");
		}
	});

	it("accepts a voice object", async () => {
		let sent: Record<string, unknown> | undefined;
		const mock = installFetchMock([{
			match: (_url, init) => {
				sent = JSON.parse(String(init?.body));
				return true;
			},
			response: jsonResponse({ audio_data: btoa("x") }),
		}]);
		await exec(args({ model: "mistral/voxtral-tts-3", input: "Hi", voice: { id: "voice-from-object" } }));
		mock.restore();
		expect(sent?.voice_id).toBe("voice-from-object");
	});

	it.each([
		["a missing voice", {}, "voice"],
		["speed", { voice: "preset-voice", speed: 1.2 }, "speed"],
		["instructions", { voice: "preset-voice", instructions: "whisper" }, "instructions"],
		["sse streaming", { voice: "preset-voice", stream_format: "sse" }, "stream_format"],
		["aac output", { voice: "preset-voice", response_format: "aac" }, "response_format"],
		["ogg output", { voice: "preset-voice", format: "ogg" }, "response_format"],
	])("rejects %s without calling Mistral or billing", async (_name, extra, param) => {
		const mock = installFetchMock([]);
		const result = await exec(args({ model: "mistral/voxtral-tts-3", input: "Hello", ...extra }));
		mock.restore();
		const { status, body, cost } = await errorOf(result);
		expect(status).toBe(400);
		expect(body.error.param).toBe(param);
		expect(cost).toBe(0);
	});

	it("passes provider errors through unbilled", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/audio/speech"),
			response: jsonResponse({ message: "Unknown voice" }, { status: 422 }),
		}]);
		const result = await exec(args({ model: "mistral/voxtral-tts-3", input: "Hello", voice: "nope" }));
		mock.restore();
		const { status, body, cost } = await errorOf(result);
		expect(status).toBe(422);
		expect(body.message).toBe("Unknown voice");
		expect(cost).toBe(0);
	});

	it("returns a 502 and bills nothing when audio_data is missing", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/audio/speech"),
			response: jsonResponse({}),
		}]);
		const result = await exec(args({ model: "mistral/voxtral-tts-3", input: "Hello", voice: "preset-voice" }));
		mock.restore();
		const { status, cost } = await errorOf(result);
		expect(status).toBe(502);
		expect(cost).toBe(0);
	});
});
