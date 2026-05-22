import { describe, expect, it } from "vitest";
import {
	mergeGatewayPlugins,
	normalizeGatewayPlugins,
	resolveGatewayPlugins,
} from "./normalize";

describe("normalizeGatewayPlugins", () => {
	it("normalizes string and object plugins and keeps last-write-wins", () => {
		const normalized = normalizeGatewayPlugins([
			" response-healing ",
			{ id: "response-healing", enabled: false, mode: "strict" },
			{ id: "trace-plugin", sample_rate: 0.5 },
		]);

		expect(normalized).toEqual([
			{
				id: "response-healing",
				enabled: false,
				config: { mode: "strict" },
				preventOverrides: false,
			},
			{
				id: "trace-plugin",
				enabled: true,
				config: { sample_rate: 0.5 },
				preventOverrides: false,
			},
		]);
	});

	it("ignores invalid plugin entries", () => {
		const normalized = normalizeGatewayPlugins([
			null,
			"",
			{},
			[],
			{ id: "  " },
			42,
		]);

		expect(normalized).toEqual([]);
	});

	it("preserves already-normalized config payloads without nesting config twice", () => {
		const normalized = normalizeGatewayPlugins([
			{ id: "response-healing", enabled: true, config: { mode: "strict" } },
		]);

		expect(normalized).toEqual([
			{
				id: "response-healing",
				enabled: true,
				config: { mode: "strict" },
				preventOverrides: false,
			},
		]);
	});

	it("preserves preventOverrides when present", () => {
		const normalized = normalizeGatewayPlugins([
			{ id: "response-healing", enabled: true, preventOverrides: true },
		]);

		expect(normalized).toEqual([
			{
				id: "response-healing",
				enabled: true,
				config: {},
				preventOverrides: true,
			},
		]);
	});
});

describe("mergeGatewayPlugins", () => {
	it("merges preset defaults with request-level overrides by plugin id", () => {
		const merged = mergeGatewayPlugins(
			[
				{ id: "response-healing", enabled: true },
				{ id: "trace-plugin", sample_rate: 0.25 },
			],
			[
				{ id: "response-healing", enabled: false },
				"search-audit",
			],
		);

		expect(merged).toEqual([
			{
				id: "response-healing",
				enabled: false,
				config: {},
				preventOverrides: false,
			},
			{
				id: "trace-plugin",
				enabled: true,
				config: { sample_rate: 0.25 },
				preventOverrides: false,
			},
			{
				id: "search-audit",
				enabled: true,
				config: {},
				preventOverrides: false,
			},
		]);
	});

	it("keeps higher-precedence defaults when preventOverrides is set", () => {
		const merged = mergeGatewayPlugins(
			[{ id: "response-healing", enabled: true, preventOverrides: true, mode: "safe" }],
			[{ id: "response-healing", enabled: false, mode: "strict" }],
		);

		expect(merged).toEqual([
			{
				id: "response-healing",
				enabled: true,
				config: { mode: "safe" },
				preventOverrides: true,
			},
		]);
	});
});

describe("resolveGatewayPlugins", () => {
	it("applies precedence in workspace < preset < request order", () => {
		const resolved = resolveGatewayPlugins({
			workspaceDefaults: [
				{ id: "response-healing", enabled: true, mode: "safe" },
				{ id: "trace-plugin", enabled: true },
			],
			presetDefaults: [
				{ id: "response-healing", enabled: false },
				{ id: "preset-only", sample_rate: 0.5 },
			],
			requestPlugins: [{ id: "response-healing", enabled: true, mode: "strict" }],
		});

		expect(resolved).toEqual([
			{
				id: "response-healing",
				enabled: true,
				config: { mode: "strict" },
				preventOverrides: false,
			},
			{
				id: "trace-plugin",
				enabled: true,
				config: {},
				preventOverrides: false,
			},
			{
				id: "preset-only",
				enabled: true,
				config: { sample_rate: 0.5 },
				preventOverrides: false,
			},
		]);
	});

	it("honors locked workspace plugin defaults over preset and request overrides", () => {
		const resolved = resolveGatewayPlugins({
			workspaceDefaults: [
				{ id: "response-healing", enabled: true, preventOverrides: true, mode: "safe" },
			],
			presetDefaults: [{ id: "response-healing", enabled: false, mode: "preset" }],
			requestPlugins: [{ id: "response-healing", enabled: false, mode: "request" }],
		});

		expect(resolved).toEqual([
			{
				id: "response-healing",
				enabled: true,
				config: { mode: "safe" },
				preventOverrides: true,
			},
		]);
	});
});
