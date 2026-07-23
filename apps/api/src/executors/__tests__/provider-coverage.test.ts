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

const MEDIA_CAPABILITIES = new Set([
	"image.generate",
	"image.edit",
	"images.generations",
	"images.edits",
	"audio.speech",
	"audio.transcription",
	"audio.translations",
	"audio.transcribe",
	"video.generate",
	"video.edit",
	"music.generate",
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

function getActiveGatewayMediaCapabilities(provider: string): Array<{
	modelId: string;
	capabilityId: string;
}> {
	const apiProviderPath = resolve(
		process.cwd(),
		"../../packages/data/catalog/src/data/api_providers",
		provider,
		"models.json",
	);
	if (!existsSync(apiProviderPath)) return [];

	const models = JSON.parse(readFileSync(apiProviderPath, "utf8")) as Array<{
		api_model_id?: string;
		is_active_gateway?: boolean;
		capabilities?: Array<{ capability_id?: string; status?: string }>;
	}>;

	return models.flatMap((model) => {
		if (model.is_active_gateway !== true) return [];
		return (model.capabilities ?? []).flatMap((capability) => {
			if (
				capability.status !== "active" ||
				!capability.capability_id ||
				!MEDIA_CAPABILITIES.has(capability.capability_id)
			) {
				return [];
			}
			return [{
				modelId: model.api_model_id ?? "unknown-model",
				capabilityId: capability.capability_id,
			}];
		});
	});
}

describe("data provider executor coverage", () => {
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

	it("resolves a media executor for every active gateway media capability in data", () => {
		const providers = readDataProviders();
		for (const provider of providers) {
			for (const { modelId, capabilityId } of getActiveGatewayMediaCapabilities(provider)) {
				const executor = resolveProviderExecutor(provider, capabilityId);
				expect(
					executor,
					`${provider}/${modelId} should resolve ${capabilityId}`,
				).toBeTruthy();
			}
		}
	});
});
