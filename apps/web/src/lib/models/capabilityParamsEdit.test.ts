import { describe, expect, test } from "vitest";
import { describeStoredParams, isParamEnabled, parseStoredParams, setParamEnabled } from "./capabilityParamsEdit";

const VEO = {
	size: { type: "enum", values: ["720p", "1080p", "4k"], aliases: ["resolution"] },
	duration: { min: 4, max: 8, step: 2, values_by_size: { "1080p": [8] } },
};

describe("capability params editing", () => {
	test("toggling a flag keeps every stored spec", () => {
		const withSeed = setParamEnabled(VEO, "seed", true) as Record<string, unknown>;
		expect(withSeed).toEqual({ ...VEO, seed: true });
		expect(setParamEnabled(withSeed, "seed", false)).toEqual(VEO);
		// Enabling a parameter that already has a spec leaves the spec alone.
		expect(setParamEnabled(VEO, "size", true)).toBe(VEO);
	});

	test("keeps a stored list a list", () => {
		// gmicloud:tencent/hy4-preview lost its names this way on 2026-09-18.
		const list = ["reasoning", "max_tokens"];
		expect(setParamEnabled(list, "tools", true)).toEqual(["reasoning", "max_tokens", "tools"]);
		expect(setParamEnabled(list, "reasoning", false)).toEqual(["max_tokens"]);
		const objects = [{ param_id: "voice", type: "string" }, "input"];
		expect(setParamEnabled(objects, "voice", false)).toEqual(["input"]);
		expect(isParamEnabled(objects, "voice")).toBe(true);
		expect(isParamEnabled(list, "tools")).toBe(false);
	});

	test("enabling a spec marked unsupported keeps its details", () => {
		const stored = { seed: { supported: false, type: "integer" }, voice: { support_level: "unsupported", values: ["alloy"] } };
		expect(isParamEnabled(stored, "seed")).toBe(false);
		const withSeed = setParamEnabled(stored, "seed", true);
		expect(withSeed).toEqual({ ...stored, seed: { supported: true, type: "integer" } });
		expect(isParamEnabled(withSeed, "seed")).toBe(true);
		const withVoice = setParamEnabled(stored, "voice", true);
		expect(withVoice).toEqual({ ...stored, voice: { supported: true, values: ["alloy"] } });
		expect(isParamEnabled(withVoice, "voice")).toBe(true);
		const list = [{ param_id: "seed", supported: false, type: "integer" }, "input"];
		expect(setParamEnabled(list, "seed", true)).toEqual([{ param_id: "seed", supported: true, type: "integer" }, "input"]);
	});

	test("previews allowed values, ranges, defaults and rules", () => {
		expect(describeStoredParams({
			...VEO,
			voice: { values: ["alloy", "echo"], default: "alloy" },
			stream: false,
			temperature: { min: 0, max: 2, step: 0.01 },
		}, 2)).toEqual([
			{ name: "size", supported: true, values: ["720p", "1080p"], more: 1 },
			{ name: "duration", supported: true, values: ["4", "6"], more: 1, rules: 1 },
			{ name: "voice", supported: true, values: ["alloy", "echo"], default: "alloy" },
			{ name: "stream", supported: false },
			{ name: "temperature", supported: true, range: { min: 0, max: 2, step: 0.01 } },
		]);
	});

	test("parses JSON objects and lists, and rejects anything else", () => {
		expect(parseStoredParams("")).toEqual({ ok: true, params: {} });
		expect(parseStoredParams('["seed"]')).toEqual({ ok: true, params: ["seed"] });
		expect(parseStoredParams("42").ok).toBe(false);
		expect(parseStoredParams("{ size: 1 }").ok).toBe(false);
	});
});
