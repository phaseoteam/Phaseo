import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec } from "../endpoints/music-generate";

const REQUEST_META = {
	requestId: "req_test_123",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const PRICING_CARD = {
	provider: "suno",
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

describe("Suno music.generate endpoint", () => {
	it("maps Suno request fields including personaModel", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.suno.example/api/v1/generate",
				response: jsonResponse({
					code: 200,
					msg: "success",
					data: {
						taskId: "task_123",
						status: "PENDING",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await exec({
			endpoint: "music.generate",
			model: "V4_5PLUS",
			body: {
				model: "V4_5PLUS",
				prompt: "A calm jazz piano piece",
				suno: {
					customMode: true,
					instrumental: false,
					style: "Jazz Ballad",
					title: "Midnight Blue",
					prompt: "Warm chords and soft brushes",
					personaModel: "style_persona",
				},
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "suno",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody?.model).toBe("V4_5PLUS");
		expect(capturedBody?.customMode).toBe(true);
		expect(capturedBody?.instrumental).toBe(false);
		expect(capturedBody?.personaModel).toBe("style_persona");
		expect(capturedBody?.title).toBe("Midnight Blue");
		expect(result.normalized?.id).toBe("task_123");
		expect(result.normalized?.status).toBe("in_progress");
	});

	it("normalizes task_id and failed statuses from Suno response", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.suno.example/api/v1/generate",
				response: jsonResponse({
					code: 200,
					msg: "success",
					data: {
						task_id: "task_fail",
						status: "GENERATE_AUDIO_FAILED",
					},
				}),
			},
		]);

		const result = await exec({
			endpoint: "music.generate",
			model: "V4_5PLUS",
			body: {
				model: "V4_5PLUS",
				prompt: "Generate a song",
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "suno",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.id).toBe("task_fail");
		expect(result.normalized?.nativeResponseId).toBe("task_fail");
		expect(result.normalized?.status).toBe("failed");
	});

	it("returns 400 when customMode requires style/title", async () => {
		const result = await exec({
			endpoint: "music.generate",
			model: "V4_5PLUS",
			body: {
				model: "V4_5PLUS",
				suno: {
					customMode: true,
					instrumental: true,
				},
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "suno",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		expect(result.normalized?.error).toBe("validation_error");
		expect(result.normalized?.reason).toBe("style_and_title_required_when_custom_mode_enabled");
	});
});

