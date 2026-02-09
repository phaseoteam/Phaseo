import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProviderExecutor } from "../index";

const EXCLUDED_NON_TEXT_OR_NOT_YET_SUPPORTED = new Map<string, string>([
	["black-forest-labs", "image-only provider"],
	["suno", "audio/music-only provider"],
	["elevenlabs", "audio/music-only provider"],
]);

function readDataProviders(): string[] {
	const root = resolve(process.cwd(), "../web/src/data/api_providers");
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

describe("data provider text.generate coverage", () => {
	it("resolves a text executor for each supported api provider in data", () => {
		const providers = readDataProviders();
		for (const provider of providers) {
			if (EXCLUDED_NON_TEXT_OR_NOT_YET_SUPPORTED.has(provider)) continue;
			const executor = resolveProviderExecutor(provider, "text.generate");
			expect(executor, `${provider} should resolve text.generate executor`).toBeTruthy();
		}
	});
});
