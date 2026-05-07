import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProviderExecutor } from "../index";

const EXCLUDED_NON_TEXT_OR_NOT_YET_SUPPORTED = new Map<string, string>([
	["black-forest-labs", "image-only provider"],
	["suno", "audio/music-only provider"],
	["elevenlabs", "audio/music-only provider"],
	["canopy-wave", "not-ready provider"],
]);

function readDataProviders(): string[] {
	const root = resolve(
		process.cwd(),
		"../../packages/data/catalog/src/data/api_providers",
	);
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();
}

function hasActiveTextGenerateModel(provider: string): boolean {
	const apiProviderPath = resolve(
		process.cwd(),
		"../../packages/data/catalog/src/data/api_providers",
		provider,
		"models.json",
	);
	if (!existsSync(apiProviderPath)) return false;
	const models = JSON.parse(readFileSync(apiProviderPath, "utf8")) as Array<{
		is_active_gateway?: boolean;
		capabilities?: Array<{ capability_id?: string; status?: string }>;
	}>;
	return models.some((model) =>
		model?.is_active_gateway === true &&
		Array.isArray(model.capabilities) &&
		model.capabilities.some(
			(capability) =>
				capability?.capability_id === "text.generate" &&
				capability?.status === "active",
		),
	);
}

describe("data provider text.generate coverage", () => {
	it("resolves a text executor for each supported api provider in data", () => {
		const providers = readDataProviders();
		for (const provider of providers) {
			if (EXCLUDED_NON_TEXT_OR_NOT_YET_SUPPORTED.has(provider)) continue;
			if (!hasActiveTextGenerateModel(provider)) {
				continue;
			}
			const executor = resolveProviderExecutor(provider, "text.generate");
			expect(executor, `${provider} should resolve text.generate executor`).toBeTruthy();
		}
	});
});
