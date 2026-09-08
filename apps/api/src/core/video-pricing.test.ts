import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PriceCard } from "@pipeline/pricing/types";
import { computeVideoPricedUsage } from "./video-pricing";
import { buildVideoPricingRequestOptions } from "./video-request-options";

function makeCard(rules: Array<Record<string, unknown>>): PriceCard {
	return {
		provider: "minimax",
		model: "minimax/hailuo-2.3",
		endpoint: "video.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: rules as any,
	};
}

function loadCatalogCard(provider: string, model: string): PriceCard {
	const pricingPath = path.resolve(
		process.cwd(),
		`../../packages/data/catalog/src/data/pricing/${provider}/${model}/video.generate/pricing.json`,
	);
	return JSON.parse(fs.readFileSync(pricingPath, "utf8")) as PriceCard;
}

function loadLtxCard(model: string): PriceCard {
	return loadCatalogCard("ltx", model);
}

describe("video primary pricing coverage", () => {
	const imageRule = { meter: "input_image", unit: "image", unit_size: 1, price_per_unit: "0.01", currency: "USD", pricing_plan: "standard", match: [] };
	it("does not settle just the reference image when the output resolution has no price", () => {
		const card = makeCard([imageRule, {
			meter: "output_video_seconds", unit: "second", unit_size: 1, price_per_unit: "0.1",
			currency: "USD", pricing_plan: "standard", match: [{ path: "resolution", op: "eq", value: "720p" }],
		}]);
		expect(() => computeVideoPricedUsage({
			card, model: "test", seconds: 8, requestOptions: { resolution: "4k", input_image_count: 1 },
		})).toThrow("pricing_rule_missing:output_video_seconds");
	});
	it.each([undefined, "audio-to-video"])("preserves reference charges when falling back to a clip price for mode %s", (mode) => {
		const card = makeCard([imageRule, {
			meter: "output_video", unit: "video", unit_size: 1, price_per_unit: "0.28",
			currency: "USD", pricing_plan: "standard", match: [],
		}]);
		const priced = computeVideoPricedUsage({
			card, model: "test", seconds: 6, requestOptions: { input_image_count: 2, mode, input_audio_seconds: 6 },
		}) as any;
		expect(priced.pricing.total_nanos).toBe(300_000_000);
	});
});

describe("Vertex Veo bills seconds rather than whole clips", () => {
	it.each([
		["google-veo-3.1-fast", "720p", false, 4, 0.32],
		["google-veo-3.1-fast", "720p", false, 8, 0.64],
		["google-veo-3.1-fast", "1080p", true, 8, 0.96],
		["google-veo-3.1", "4k", true, 8, 4.8],
	] as const)("%s %s audio=%s: %s seconds costs $%s", (model, resolution, audio, seconds, usd) => {
		const priced = computeVideoPricedUsage({
			card: loadCatalogCard("google-vertex", model), model, seconds,
			requestOptions: buildVideoPricingRequestOptions({ resolution, audio, outputCount: 1 }),
		}) as any;
		expect(priced.pricing.total_nanos).toBe(Math.round(usd * 1e9));
	});
});

describe("BytePlus published video token rates", () => {
	// https://www.byteplus.com/en/product/modelark, checked 2026-09-06.
	it.each([
		["bytedance-seedance-2.0", "720p", 0, 7],
		["bytedance-seedance-2.0", "720p", 2, 4.3],
		["bytedance-seedance-2.0", "1080p", 0, 7.7],
		["bytedance-seedance-2.0", "1080p", 2, 4.7],
		["bytedance-seedance-2.0-mini-260615", "720p", 0, 3.5],
		["bytedance-seedance-2.0-mini-260615", "720p", 2, 2.1],
	] as const)("%s at %s with %s input seconds costs $%s per million tokens", (model, resolution, inputSeconds, usd) => {
		const priced = computeVideoPricedUsage({
			card: loadCatalogCard("byteplus", model), model, seconds: 8,
			requestOptions: { resolution, input_video_seconds: inputSeconds, total_tokens: 1_000_000 },
		}) as any;
		expect(priced.pricing.total_nanos).toBe(Math.round(usd * 1e9));
	});
});

function makeSeedanceCard(): PriceCard {
	return {
		provider: "byteplus",
		model: "bytedance/seedance-2.5",
		endpoint: "video.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: [
			{
				pricing_plan: "standard",
				meter: "total_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "10.7",
				currency: "USD",
				match: [{ path: "input_video_seconds", op: "eq", value: 0 }],
				priority: 100,
			},
			{
				pricing_plan: "standard",
				meter: "total_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "6.4",
				currency: "USD",
				match: [{ path: "input_video_seconds", op: "gt", value: 0 }],
				priority: 100,
			},
		] as any,
	};
}

// Published generation and audio-input rates: https://docs.ltx.io/pricing (2026-09-06).
describe("LTX documented resolution pricing", () => {
	const resolutions = ["1280x720", "1920x1080", "2560x1440", "3840x2160"];
	const rates = [
		{ model: "ltx-2-3-fast", output: [0.03, 0.06, 0.12, 0.24], audio: null },
		{ model: "ltx-2-3-pro", output: [0.04, 0.08, 0.16, 0.32], audio: [0.06, 0.10, 0.18, 0.34] },
		{ model: "ltx-2-5-fast", output: [0.09, 0.13, 0.19, 0.30], audio: [0.09, 0.13, 0.19, 0.30] },
		{ model: "ltx-2-5-pro", output: [0.12, 0.17, 0.25, 0.39], audio: [0.12, 0.17, 0.25, 0.39] },
	];
	for (const { model, output, audio } of rates) {
		for (const [index, landscape] of resolutions.entries()) {
			for (const resolution of [landscape, landscape.split("x").reverse().join("x")]) {
				it(`${model} ${resolution} bills six output seconds`, () => {
					const priced = computeVideoPricedUsage({
						card: loadLtxCard(model), model, seconds: 6, requestOptions: { resolution },
					}) as any;
					expect(priced.pricing.total_nanos).toBe(Math.round(output[index] * 6 * 1e9));
				});
				if (audio) it(`${model} ${resolution} bills source audio without double charging output`, () => {
					const priced = computeVideoPricedUsage({
						card: loadLtxCard(model), model, seconds: 8,
						requestOptions: { resolution, mode: "audio-to-video", input_audio_seconds: 2.5 },
					}) as any;
					expect(priced.pricing.total_nanos).toBe(Math.round(audio[index] * 2.5 * 1e9));
					expect(priced.pricing.lines.map((line: any) => line.dimension)).toEqual(["input_audio_seconds"]);
				});
			}
		}
	}
});

describe("video-pricing", () => {
	it("prices LTX requests from the canonical catalogue card", () => {
		const card = loadLtxCard("ltx-2-5-pro");
		const textVideo = computeVideoPricedUsage({
			seconds: 10,
			card,
			model: "ltx-2-5-pro",
			requestOptions: { resolution: "1920x1080" },
		});
		const audioVideo = computeVideoPricedUsage({
			seconds: 10,
			card,
			model: "ltx-2-5-pro",
			requestOptions: { mode: "audio-to-video", resolution: "1920x1080", input_audio_seconds: 10 },
		});

		expect((textVideo as any)?.pricing?.total_usd_str).toBe("1.7");
		expect((audioVideo as any)?.pricing?.total_usd_str).toBe("1.7");
	});

	it("prices audio-driven generation by input audio duration only", () => {
		const card = makeCard([
			{ pricing_plan: "standard", meter: "output_video_seconds", unit: "second", unit_size: 1, price_per_unit: "0.17", currency: "USD", match: [], priority: 100 },
			{ pricing_plan: "standard", meter: "input_audio_seconds", unit: "second", unit_size: 1, price_per_unit: "0.17", currency: "USD", match: [{ path: "mode", op: "eq", value: "audio-to-video" }], priority: 110 },
		]);
		const priced = computeVideoPricedUsage({ seconds: 10, card, model: "ltx-2-5-pro", requestOptions: { mode: "audio-to-video", input_audio_seconds: 10 } });
		expect((priced as any)?.pricing?.total_usd_str).toBe("1.7");
		expect((priced as any)?.input_audio_seconds).toBe(10);
		expect((priced as any)?.output_video_seconds).toBeUndefined();
	});

	it("uses output_video_seconds meter when available", () => {
		const card = makeCard([
			{
				pricing_plan: "standard",
				meter: "output_video_seconds",
				unit: "seconds",
				unit_size: 6,
				price_per_unit: "0.28",
				currency: "USD",
				match: [
					{ path: "video_params.resolution", op: "eq", value: "768P" },
					{ path: "video_params.seconds", op: "eq", value: 6 },
				],
				priority: 100,
			},
		]);

		const priced = computeVideoPricedUsage({
			seconds: 6,
			card,
			model: "minimax/hailuo-2.3",
			requestOptions: {
				video_params: {
					resolution: "768P",
				},
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.28");
	});

	it("prices normalized image and source-video inputs alongside output duration", () => {
		const card = makeCard([
			{
				pricing_plan: "standard",
				meter: "input_image",
				unit: "image",
				unit_size: 1,
				price_per_unit: "0.01",
				currency: "USD",
				match: [],
				priority: 100,
			},
			{
				pricing_plan: "standard",
				meter: "input_video_seconds",
				unit: "second",
				unit_size: 1,
				price_per_unit: "0.02",
				currency: "USD",
				match: [],
				priority: 100,
			},
			{
				pricing_plan: "standard",
				meter: "output_video_seconds",
				unit: "second",
				unit_size: 1,
				price_per_unit: "0.08",
				currency: "USD",
				match: [],
				priority: 100,
			},
		]);

		const priced = computeVideoPricedUsage({
			seconds: 5,
			card,
			model: "example/video",
			requestOptions: {
				input_image_count: 2,
				input_video_count: 1,
				input_video_seconds: 4,
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.5");
	});

	it("falls back to legacy output_video meter when seconds meter is absent", () => {
		const card = makeCard([
			{
				pricing_plan: "standard",
				meter: "output_video",
				unit: "video",
				unit_size: 1,
				price_per_unit: "0.56",
				currency: "USD",
				match: [
					{ path: "video_params.resolution", op: "eq", value: "768P" },
					{ path: "video_params.seconds", op: "eq", value: 10 },
				],
				priority: 100,
			},
		]);

		const priced = computeVideoPricedUsage({
			seconds: 10,
			card,
			model: "minimax/hailuo-2.3",
			requestOptions: {
				video_params: {
					resolution: "768p",
				},
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.56");
	});

	it("prices each requested output for per-video cards", () => {
		const card = makeCard([
			{
				pricing_plan: "standard",
				meter: "output_video",
				unit: "video",
				unit_size: 1,
				price_per_unit: "0.4",
				currency: "USD",
				match: [],
				priority: 100,
			},
		]);

		const priced = computeVideoPricedUsage({
			seconds: 16,
			card,
			model: "google/veo-3.1",
			requestOptions: { sampleCount: 2 },
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.8");
	});

	it("prices Seedance 2.5 without video input from resolution, ratio, duration, and frame rate", () => {
		const priced = computeVideoPricedUsage({
			seconds: 5,
			card: makeSeedanceCard(),
			model: "dreamina-seedance-2-5-260628",
			requestOptions: {
				resolution: "720p",
				aspect_ratio: "16:9",
				input_video_seconds: 0,
				frame_rate: 24,
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("1.1556");
	});

	it("applies the Seedance 2.5 minimum token floor when video input is present", () => {
		const priced = computeVideoPricedUsage({
			seconds: 5,
			card: makeSeedanceCard(),
			model: "dreamina-seedance-2-5-260628",
			requestOptions: {
				resolution: "720p",
				aspect_ratio: "16:9",
				input_video_count: 1,
				input_video_seconds: 2,
				frame_rate: 24,
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("1.24416");
	});

	it("uses Seedance 2.5 provider dimensions for ultrawide 480p output", () => {
		const priced = computeVideoPricedUsage({
			seconds: 5,
			card: makeSeedanceCard(),
			model: "bytedance/seedance-2.5",
			requestOptions: {
				resolution: "480p",
				aspect_ratio: "21:9",
				input_video_count: 1,
				input_video_seconds: 2,
				frame_rate: 24,
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.5785344");
	});

	it("covers every documented Seedance 2.5 resolution and aspect-ratio dimension", () => {
		const dimensions = {
			"480p": {
				"16:9": [854, 480],
				"9:16": [480, 854],
				"4:3": [752, 560],
				"3:4": [560, 752],
				"1:1": [640, 640],
				"21:9": [992, 432],
			},
			"720p": {
				"16:9": [1280, 720],
				"9:16": [720, 1280],
				"4:3": [1112, 834],
				"3:4": [834, 1112],
				"1:1": [960, 960],
				"21:9": [1470, 630],
			},
		} as const;

		for (const [resolution, ratios] of Object.entries(dimensions)) {
			for (const [aspectRatio, [width, height]] of Object.entries(ratios)) {
				const priced = computeVideoPricedUsage({
					seconds: 4,
					card: makeSeedanceCard(),
					model: "dreamina-seedance-2-5-260628",
					requestOptions: {
						resolution,
						aspect_ratio: aspectRatio,
						input_video_seconds: 0,
						frame_rate: 24,
					},
				});
				const expectedTokens = Math.round((4 * width * height * 24) / 1024);
				const expectedCost = (expectedTokens * 10.7) / 1_000_000;
				expect(Number((priced as any)?.pricing?.total_usd_str)).toBeCloseTo(expectedCost, 8);
			}
		}
	});

	it("extends the Seedance 2.5 minimum token formula through 30-second outputs", () => {
		const priced = computeVideoPricedUsage({
			seconds: 30,
			card: makeSeedanceCard(),
			model: "bytedance/seedance-2.5",
			requestOptions: {
				resolution: "720p",
				aspect_ratio: "1:1",
				input_video_count: 1,
				input_video_seconds: 2,
				frame_rate: 24,
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("6.912");
	});

	it("settles adaptive Seedance 2.5 jobs from authoritative provider token usage", () => {
		const priced = computeVideoPricedUsage({
			seconds: 30,
			card: makeSeedanceCard(),
			model: "dreamina-seedance-2-5-260628",
			requestOptions: {
				resolution: "720p",
				aspect_ratio: "adaptive",
				input_video_count: 1,
				input_video_seconds: 12,
				total_tokens: 123_456,
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.7901184");
	});
});
