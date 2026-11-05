import { describe, expect, it } from "vitest";
import {
	normalizeParameterSpec,
	normalizeParameterSpecs,
	parameterOptions,
	resolveParameterSpec,
} from "./model-parameters";

// Every key found in v2_route_capabilities.params and v2_route_parameter_support on
// 2026-11-04 (590 distinct specs). Each must be read into the standard shape,
// except the few kept as they are in `extra`.
const STORED_KEYS = [
	"alias_for", "aliases", "allowlist", "always_on", "aspect_ratio_values", "default", "default_effort",
	"default_value", "dimension_max", "dimension_min", "dimension_multiple_of", "effort", "enabled", "enum",
	"format", "formats", "gateway_max", "gateway_max_items", "gateway_min", "include_usage",
	"item_max_length_exclusive", "item_max_words", "item_types", "mandatory", "maps_to", "max",
	"max_aspect_ratio", "max_bytes", "max_file_size_mb", "max_height", "max_items", "max_length",
	"max_pair_tokens", "max_pixels", "max_string_bytes", "max_tokens", "max_total_tokens", "max_width", "min",
	"min_items", "min_length", "min_pixels", "mode", "multiple_of", "notes", "param_id", "properties",
	"provider_catalog", "provider_default", "provider_max", "provider_min", "provider_param", "provider_values",
	"required", "requires", "source_url", "step", "support_level", "supported_efforts", "supported_values",
	"ttl", "type", "upstream_parameter", "value_schema", "values", "values_by_size", "verified_at", "verified_on",
];
const KEPT_AS_EXTRA = new Set([
	"allowlist", "provider_catalog", "item_max_words", "item_max_length_exclusive", "max_pair_tokens",
	"max_total_tokens", "max_string_bytes",
]);

describe("normalizeParameterSpec", () => {
	it.each(STORED_KEYS)("reads stored key %s", (key) => {
		const sample: Record<string, unknown> = {
			alias_for: "top_n", aliases: ["resolution"], aspect_ratio_values: ["1:1"], effort: { supported_values: ["low"] },
			enabled: { supported_values: [true] }, enum: ["a"], format: "int64", formats: ["png"], include_usage: { supported_values: [true] },
			item_types: ["text"], maps_to: "text", max_aspect_ratio: "3:1", mode: { supported_values: ["implicit"] },
			notes: "n", param_id: "x", properties: { a: { type: "boolean" } }, provider_catalog: { name: "fast" },
			provider_param: "p", provider_values: ["url"], requires: ["width"], source_url: "https://example.com",
			support_level: "native", supported_efforts: ["low"], supported_values: ["a"], ttl: { supported_values: ["5m"] },
			type: "string", upstream_parameter: "u", value_schema: { enum: ["a"] }, values: ["a"],
			values_by_size: { "1080p": [8] }, verified_at: "2026-09-21", verified_on: "2026-09-21",
			default: "a", default_effort: "a", default_value: "a", always_on: true, mandatory: true, required: true,
			allowlist: ["a"],
		};
		const spec = normalizeParameterSpec({ [key]: sample[key] ?? 4 });
		if (KEPT_AS_EXTRA.has(key)) expect(spec.extra).toHaveProperty(key);
		else expect(spec.extra).toBeUndefined();
	});

	it("reads every spelling of allowed values and defaults", () => {
		expect(normalizeParameterSpec({ type: "enum", values: ["480p", "720p"], default: "480p" }))
			.toEqual({ supported: true, type: "string", values: ["480p", "720p"], default: "480p" });
		expect(normalizeParameterSpec({ enum: ["720p", "1080p"], type: "string", default: "720p" }))
			.toMatchObject({ type: "string", values: ["720p", "1080p"], default: "720p" });
		expect(normalizeParameterSpec({ default_value: "medium", supported_values: ["low", "medium", "high"] }))
			.toEqual({ supported: true, type: "string", values: ["low", "medium", "high"], default: "medium" });
		expect(normalizeParameterSpec({ mandatory: true, default_effort: "max", supported_efforts: ["low", "max"] }))
			.toEqual({ supported: true, type: "string", values: ["low", "max"], default: "max", required: true });
		expect(normalizeParameterSpec({ value_schema: { enum: ["none", "high"], type: "string", default: "high" }, support_level: "native" }))
			.toEqual({ supported: true, type: "string", values: ["none", "high"], default: "high", support_level: "native" });
	});

	it("reads range pairs and allowed_values", () => {
		// providers lists internal ids the catalogue adds when it merges routes; never returned.
		expect(normalizeParameterSpec({ range: [0, 2], providers: ["openai"] })).toEqual({ supported: true, min: 0, max: 2 });
		expect(normalizeParameterSpec({ allowed_values: ["json_schema"] })).toEqual({ supported: true, type: "string", values: ["json_schema"] });
	});

	it("types whole-number lists as integers and drops null entries", () => {
		// ltx-2-5-pro: null meant "automatic duration".
		expect(normalizeParameterSpec({ max: 10, min: 6, enum: [null, 6, 8, 10], type: "number" }))
			.toEqual({ supported: true, type: "integer", values: [6, 8, 10], min: 6, max: 10 });
		expect(normalizeParameterSpec({ type: "enum", values: [6, 10] })).toMatchObject({ type: "integer" });
	});

	it("prefers the gateway's limits, then the stored, then the provider's", () => {
		expect(normalizeParameterSpec({ type: "number", maps_to: "voice_settings.speed", gateway_max: 4, gateway_min: 0.25 }))
			.toEqual({ supported: true, type: "number", min: 0.25, max: 4, upstream_name: "voice_settings.speed" });
		expect(normalizeParameterSpec({ param_id: "max_tokens", provider_max: 1048576, provider_min: 1, provider_default: 131072, upstream_parameter: "max_completion_tokens" }))
			.toEqual({ supported: true, min: 1, max: 1048576, provider_default: 131072, upstream_name: "max_completion_tokens" });
		expect(normalizeParameterSpec({ provider_max: null, provider_min: null, provider_default: null, supported_values: ["minimal", "high"] }))
			.toEqual({ supported: true, type: "string", values: ["minimal", "high"] });
	});

	it("reads file, list and dimension limits", () => {
		expect(normalizeParameterSpec({ type: "image_or_array", formats: ["png", "jpg"], required: true, max_items: 16, max_file_size_mb: 50 }))
			.toEqual({ supported: true, type: ["file", "array"], media: "image", formats: ["png", "jpg"], required: true, max_items: 16, max_file_size_bytes: 52428800 });
		expect(normalizeParameterSpec({ type: "file", max_bytes: 33554432 })).toEqual({ supported: true, type: "file", max_file_size_bytes: 33554432 });
		expect(normalizeParameterSpec({ type: "string_or_array", gateway_max_items: 2048 })).toEqual({ supported: true, type: ["string", "array"], max_items: 2048 });
		expect(normalizeParameterSpec({
			type: "string", values: ["auto", "1024x1024"], max_width: 3840, max_height: 3840, max_pixels: 8294400,
			min_pixels: 655360, max_aspect_ratio: "3:1", dimension_multiple_of: 16,
		}).dimensions).toEqual({ multiple_of: 16, max_width: 3840, max_height: 3840, min_pixels: 655360, max_pixels: 8294400, max_aspect_ratio: "3:1" });
		expect(normalizeParameterSpec({ max: 2048, min: 512, type: "integer", requires: ["width"], multiple_of: 8 }))
			.toEqual({ supported: true, type: "integer", min: 512, max: 2048, multiple_of: 8, requires: ["width"] });
	});

	it("reads sub-fields of object parameters", () => {
		const reasoning = normalizeParameterSpec({
			notes: "Both are optional.",
			effort: { default_value: "max", supported_values: ["low", "high", "max"] },
			enabled: { default_value: true, supported_values: [true] },
			param_id: "reasoning",
		});
		expect(reasoning.properties).toEqual({
			effort: { supported: true, type: "string", values: ["low", "high", "max"], default: "max" },
			enabled: { supported: true, type: "boolean", values: [true], default: true },
		});
		expect(normalizeParameterSpec({ type: "object", properties: { truncation: { type: "boolean", provider_default: true } } }).properties)
			.toEqual({ truncation: { supported: true, type: "boolean", provider_default: true } });
	});

	it("turns values_by_size into a when rule", () => {
		expect(normalizeParameterSpec({ max: 8, min: 4, step: 2, type: "number", aliases: ["seconds"], values_by_size: { "4k": [8], "1080p": [8] } }))
			.toEqual({
				supported: true, type: "number", min: 4, max: 8, step: 2, aliases: ["seconds"],
				when: [{ if: { size: ["4k"] }, values: [8] }, { if: { size: ["1080p"] }, values: [8] }],
			});
	});

	it("marks unsupported parameters and keeps value labels", () => {
		expect(normalizeParameterSpec({ support_level: "unsupported" })).toEqual({ supported: false, support_level: "unsupported" });
		expect(normalizeParameterSpec({ values: [{ id: "alloy", label: "Alloy", gender: "neutral" }, "echo"] })).toEqual({
			supported: true,
			type: "string",
			values: ["alloy", "echo"],
			options: [{ value: "alloy", label: "Alloy", gender: "neutral" }, { value: "echo" }],
		});
	});
});

describe("the standard shape reads back unchanged", () => {
	const samples: unknown[] = [
		{ type: "image_or_array", formats: ["png", "jpg"], required: true, max_items: 16, max_file_size_mb: 50 },
		{ type: "number", maps_to: "voice_settings.speed", gateway_max: 4, gateway_min: 0.25 },
		{ type: "string", values: ["auto", "1024x1024"], max_width: 3840, max_pixels: 8294400, dimension_multiple_of: 16, aspect_ratio_values: ["1:1"] },
		{ max: 8, min: 4, step: 2, type: "number", aliases: ["seconds"], values_by_size: { "4k": [8] } },
		{ type: "enum", values: ["url", "b64_json"], provider_values: ["url", "base64"], provider_default: "url" },
		{ values: [{ id: "alloy", label: "Alloy" }, "echo"], default: "alloy", source_url: "https://example.com", verified_on: "2026-11-04" },
		{ effort: { default_value: "max", supported_values: ["low", "max"] }, alias_for: "reasoning_effort", provider_catalog: { name: "fast" } },
		{ type: "file", media: "audio", max_file_size_bytes: 1024, upstream_name: "file" },
		{ values: ["alloy", "echo"], options: [{ value: "alloy", label: "Alloy" }, { value: "echo", label: "Echo" }] },
	];
	it.each(samples.map((sample) => [JSON.stringify(sample).slice(0, 60), sample]))("%s", (_label, sample) => {
		const once = normalizeParameterSpec(sample);
		expect(normalizeParameterSpec(once)).toEqual(once);
	});

	it("keeps repeated upstream values paired with values", () => {
		// ElevenLabs: wav and pcm both map to pcm_44100.
		expect(normalizeParameterSpec({ values: ["mp3", "wav", "pcm"], upstream_values: ["mp3_44100_128", "pcm_44100", "pcm_44100"] }).upstream_values)
			.toEqual(["mp3_44100_128", "pcm_44100", "pcm_44100"]);
	});

	it("keeps labels given as a separate options list", () => {
		expect(normalizeParameterSpec({ values: ["alloy"], options: [{ value: "alloy", label: "Alloy" }] }).options).toEqual([{ value: "alloy", label: "Alloy" }]);
	});
});

describe("normalizeParameterSpecs", () => {
	it("reads every container form", () => {
		expect(normalizeParameterSpecs(["input", "voice"])).toEqual({ input: { supported: true }, voice: { supported: true } });
		expect(normalizeParameterSpecs([
			{ type: "string", maps_to: "text", param_id: "input", provider_max: 30000 },
			{ type: "enum", values: ["mp3", "wav"], maps_to: "output_format", param_id: "format" },
		])).toEqual({
			input: { supported: true, type: "string", max: 30000, upstream_name: "text" },
			format: { supported: true, type: "string", values: ["mp3", "wav"], upstream_name: "output_format" },
		});
		expect(normalizeParameterSpecs({ request: { allowlist: ["max_tokens", "tools"] }, temperature: true, logprobs: false }))
			.toEqual({ max_tokens: { supported: true }, tools: { supported: true }, temperature: { supported: true }, logprobs: { supported: false } });
		expect(normalizeParameterSpecs(null)).toEqual({});
	});

	it("skips list positions that lost their names", () => {
		// gmicloud:tencent/hy4-preview held this until 2026-11-04.
		expect(normalizeParameterSpecs({ 0: true, 1: true })).toEqual({});
		expect(normalizeParameterSpecs({ 0: "tools" })).toEqual({ tools: { supported: true } });
	});
});

describe("resolveParameterSpec and parameterOptions", () => {
	const specs = normalizeParameterSpecs({
		size: { type: "enum", values: ["720p", "1080p", "4k"], aliases: ["resolution"] },
		duration: { max: 8, min: 4, step: 2, type: "number", values_by_size: { "1080p": [8], "4k": [8] } },
		voice: { values: [{ id: "alloy", label: "Alloy" }, { id: "ash", label: "Ash" }], when: [{ if: { language: ["fr"] }, values: ["ash"] }] },
	});

	it("spells out a range and applies matching rules", () => {
		expect(parameterOptions(specs.duration).map((option) => option.value)).toEqual([4, 6, 8]);
		expect(parameterOptions(resolveParameterSpec(specs.duration!, { size: "4K" }, specs)).map((option) => option.value)).toEqual([8]);
		expect(parameterOptions(resolveParameterSpec(specs.duration!, { resolution: "1080p" }, specs)).map((option) => option.value)).toEqual([8]);
		expect(parameterOptions(resolveParameterSpec(specs.duration!, { size: "720p" }, specs)).map((option) => option.value)).toEqual([4, 6, 8]);
	});

	it("keeps labels for the values a rule leaves", () => {
		expect(parameterOptions(resolveParameterSpec(specs.voice!, { language: "fr" }, specs))).toEqual([{ value: "ash", label: "Ash" }]);
	});

	it("uses other parameters' defaults when the selection leaves them out", () => {
		// gpt-image-1-mini: "partial_images requires stream=true".
		const image = normalizeParameterSpecs({
			stream: { type: "boolean", default: false },
			partial_images: { type: "integer", min: 0, max: 3, when: [{ if: { stream: [false] }, supported: false, message: "Requires stream=true." }] },
		});
		expect(resolveParameterSpec(image.partial_images!, {}, image).supported).toBe(false);
		expect(resolveParameterSpec(image.partial_images!, { stream: true }, image).supported).toBe(true);
		expect(parameterOptions(resolveParameterSpec(image.partial_images!, {}, image))).toEqual([]);
	});

	it("offers nothing for free-form, open or very large ranges", () => {
		expect(parameterOptions(normalizeParameterSpec({ type: "number", min: 1 }))).toEqual([]);
		expect(parameterOptions(normalizeParameterSpec({ type: "integer", min: 1, max: 1048576 }))).toEqual([]);
		expect(parameterOptions(normalizeParameterSpec({ support_level: "unsupported", values: ["a"] }))).toEqual([]);
	});

	it("is a no-op on rules that name no selected parameter", () => {
		expect(resolveParameterSpec(specs.duration!, {}, specs)).toEqual(specs.duration);
		expect(parameterOptions(resolveParameterSpec(specs.duration!, {}, specs))).toHaveLength(3);
	});
});
