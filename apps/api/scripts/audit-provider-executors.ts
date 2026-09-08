import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { EXECUTORS_BY_PROVIDER, normalizeCapability, resolveProviderExecutor } from "../src/executors/index";
import { normalizeProviderId } from "../src/lib/config/providerAliases";
import { getProviderProfile } from "../src/providers/providerProfiles";

// Read-only audit: includes disabled offers so missing adapters cannot hide behind
// is_active_gateway. Batch and realtime have their own execution paths.
const root = fileURLToPath(new URL("../../../packages/data/catalog/src/data/api_providers/", import.meta.url));
const separateSurfaces = new Set(["batch", "audio.realtime"]);
const providers = readdirSync(root, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => {
		const providerId = entry.name;
		const metadataPath = resolve(root, providerId, "api_provider.json");
		const modelsPath = resolve(root, providerId, "models.json");
		const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, "utf8")) : {};
		const models = existsSync(modelsPath) ? JSON.parse(readFileSync(modelsPath, "utf8")) : [];
		const profile = getProviderProfile(providerId);
		const capabilities: Record<string, { current: number; active: number; executor: boolean; profileDisabled: boolean }> = {};
		const missingCapabilityModels: string[] = [];
		for (const model of models) {
			if (model.effective_from && Date.parse(model.effective_from) > Date.now()) continue;
			if (model.effective_to && Date.parse(model.effective_to) <= Date.now()) continue;
			if (!model.capabilities?.length) missingCapabilityModels.push(model.provider_model_slug ?? model.api_model_id);
			for (const capability of model.capabilities ?? []) {
				const id = normalizeCapability(capability.capability_id);
				const entry = capabilities[id] ??= {
					current: 0,
					active: 0,
					executor: Boolean(resolveProviderExecutor(providerId, id)),
					profileDisabled: profile?.textOnly === true && !["text.generate", "embeddings", "rerank", "moderations"].includes(id)
						|| (profile?.adapterBackedOverrides as Record<string, boolean> | undefined)?.[id] === false,
				};
				entry.current++;
				if (model.is_active_gateway === true && capability.status === "active") entry.active++;
			}
		}
		return {
			providerId,
			hasExecutor: Boolean(EXECUTORS_BY_PROVIDER[normalizeProviderId(providerId)]),
			gatewayKind: metadata.gateway_kind ?? null,
			routingEnabled: metadata.routing_enabled ?? null,
			modelCount: models.length,
			missingCapabilityModels,
			capabilities,
		};
	}).filter((provider) => !process.argv.includes("--gateway-only") || provider.hasExecutor)
	.sort((a, b) => a.providerId.localeCompare(b.providerId));

if (process.argv.includes("--json")) {
	console.log(JSON.stringify(providers, null, 2));
} else {
	console.log("Provider | Catalog models | Current capability offers (active; executor; profile)");
	for (const provider of providers) {
		const capabilities = Object.entries(provider.capabilities).map(([id, value]) =>
			`${id}: ${value.current} (${value.active} active; ${separateSurfaces.has(id) ? "separate surface" : value.executor ? "executor" : "MISSING"}${value.profileDisabled ? "; profile disabled" : ""})`,
		).join(", ");
		console.log(`${provider.providerId}${provider.hasExecutor ? "" : " [no executor]"} | ${provider.modelCount} | ${capabilities}`);
		if (provider.missingCapabilityModels.length) console.log(`  No capabilities: ${provider.missingCapabilityModels.join(", ")}`);
	}
}
