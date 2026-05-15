// Purpose: Merge preset configuration with request body
// Why: Presets allow teams to standardize prompts, parameters, and routing
// How: Apply preset defaults, inject system prompts, filter providers

import type { PresetConfig, PresetData, ProviderCandidate } from "./types";
import { normalizeProviderId, normalizeProviderList } from "@/lib/config/providerAliases";
import { mergeGatewayPlugins } from "@/plugins/normalize";

/**
 * Merge preset configuration with request body
 * Preset defaults are applied only if not already present in the request
 * System prompts are prepended to messages
 */
export function mergePresetWithBody(body: any, preset: PresetData): any {
	const config = preset.config;
	const merged = { ...body };

	if (config.defaultModel && merged.model === undefined) {
		merged.model = config.defaultModel;
	}

	// Apply default parameters (don't override existing values)
	if (config.defaultParams) {
		for (const [key, value] of Object.entries(config.defaultParams)) {
			if (merged[key] === undefined) {
				merged[key] = value;
			}
		}
	}

	// Inject system prompt (prepend to existing system or messages)
	if (config.systemPrompt) {
		if (merged.messages && Array.isArray(merged.messages)) {
			// Check if there's already a system message
			const hasSystem = merged.messages.some((m: any) => m.role === "system");

			if (hasSystem) {
				// Prepend to existing system message
				merged.messages = merged.messages.map((m: any) => {
					if (m.role === "system") {
						return {
							...m,
							content: config.systemPrompt + "\n\n" + m.content,
						};
					}
					return m;
				});
			} else {
				// Add new system message at the beginning
				merged.messages = [
					{ role: "system", content: config.systemPrompt },
					...merged.messages,
				];
			}
		} else if (merged.system !== undefined) {
			// Anthropic-style system parameter
			merged.system = config.systemPrompt + "\n\n" + merged.system;
		}
	}

	const mergedPlugins = mergeGatewayPlugins(config.plugins, merged.plugins);
	if (mergedPlugins.length > 0) {
		merged.plugins = mergedPlugins.map((plugin) => ({
			id: plugin.id,
			enabled: plugin.enabled,
			...plugin.config,
		}));
	}

	if (config.provider) {
		const presetProvider: Record<string, unknown> = {};
		if (config.provider.order?.length) {
			presetProvider.order = config.provider.order;
		}
		if (config.provider.only?.length) {
			presetProvider.only = config.provider.only;
		}
		if (config.provider.ignore?.length) {
			presetProvider.ignore = config.provider.ignore;
		}
		if (config.provider.requiredExecutionRegion) {
			presetProvider.required_execution_region =
				config.provider.requiredExecutionRegion;
		}
		if (config.provider.requiredDataRegion) {
			presetProvider.required_data_region =
				config.provider.requiredDataRegion;
		}
		if (typeof config.provider.requireZeroDataRetention === "boolean") {
			presetProvider.require_zero_data_retention =
				config.provider.requireZeroDataRetention;
		}
		if (config.provider.maxPrice) {
			presetProvider.max_price = config.provider.maxPrice;
		}
		if (config.provider.preferredMinThroughput !== null && config.provider.preferredMinThroughput !== undefined) {
			presetProvider.preferred_min_throughput = config.provider.preferredMinThroughput;
		}
		if (config.provider.preferredMaxLatency !== null && config.provider.preferredMaxLatency !== undefined) {
			presetProvider.preferred_max_latency = config.provider.preferredMaxLatency;
		}
		if (Object.keys(presetProvider).length > 0) {
			const requestProvider =
				merged.provider && typeof merged.provider === "object" && !Array.isArray(merged.provider)
					? merged.provider
					: {};
			merged.provider = {
				...presetProvider,
				...requestProvider,
				max_price:
					requestProvider.max_price ??
					requestProvider.maxPrice ??
					presetProvider.max_price,
				required_execution_region:
					requestProvider.required_execution_region ??
					requestProvider.requiredExecutionRegion ??
					presetProvider.required_execution_region,
				required_data_region:
					requestProvider.required_data_region ??
					requestProvider.requiredDataRegion ??
					presetProvider.required_data_region,
				require_zero_data_retention:
					requestProvider.require_zero_data_retention ??
					requestProvider.requireZeroDataRetention ??
					presetProvider.require_zero_data_retention,
				preferred_min_throughput:
					requestProvider.preferred_min_throughput ??
					requestProvider.preferredMinThroughput ??
					presetProvider.preferred_min_throughput,
				preferred_max_latency:
					requestProvider.preferred_max_latency ??
					requestProvider.preferredMaxLatency ??
					presetProvider.preferred_max_latency,
			};
		}
	}

	return merged;
}

/**
 * Filter providers based on preset constraints
 * Returns only providers that match the preset's allow/deny lists
 */
export function filterProvidersByPreset(
	providers: ProviderCandidate[],
	config: PresetConfig
): ProviderCandidate[] {
	let filtered = [...providers];

	// Apply allowed providers filter
	if (config.allowedProviders && config.allowedProviders.length > 0) {
		const allowedSet = new Set(normalizeProviderList(config.allowedProviders));
		filtered = filtered.filter((p) => allowedSet.has(p.providerId));
	}

	// Apply denied providers filter
	if (config.deniedProviders && config.deniedProviders.length > 0) {
		const deniedSet = new Set(normalizeProviderList(config.deniedProviders));
		filtered = filtered.filter((p) => !deniedSet.has(p.providerId));
	}

	return filtered;
}

/**
 * Validate that the requested model is allowed by the preset
 * Returns error message if model is not allowed, null if valid
 */
export function validatePresetModel(
	requestedModel: string,
	config: PresetConfig
): string | null {
	if (!config.allowedModels || config.allowedModels.length === 0) {
		return null; // No restrictions
	}

	// Check exact match
	if (config.allowedModels.includes(requestedModel)) {
		return null;
	}

	// Check wildcard patterns (e.g., "claude-*", "gpt-4*")
	for (const pattern of config.allowedModels) {
		if (pattern.includes("*")) {
			const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
			if (regex.test(requestedModel)) {
				return null;
			}
		}
	}

	// Model not allowed
	return `Model "${requestedModel}" is not allowed by preset. Allowed models: ${config.allowedModels.join(", ")}`;
}

/**
 * Apply provider preferences/weights from preset
 * Adjusts base weights of providers based on preset configuration
 */
export function applyProviderPreferences(
	providers: ProviderCandidate[],
	config: PresetConfig
): ProviderCandidate[] {
	if (!config.providerPreferences) {
		return providers;
	}

	const canonicalPreferences = Object.fromEntries(
		Object.entries(config.providerPreferences).map(([providerId, weight]) => [
			normalizeProviderId(providerId),
			weight,
		]),
	);

	return providers.map((provider) => {
		const preference = canonicalPreferences[provider.providerId];
		if (preference !== undefined && Number.isFinite(preference)) {
			return {
				...provider,
				baseWeight: provider.baseWeight * preference,
			};
		}
		return provider;
	});
}

export function resolvePresetRoutingMode(
	config: PresetConfig,
	fallback?: string | null
): "balanced" | "price" | "latency" | "throughput" | null {
	const candidate = (config.routingMode ?? "").toLowerCase();
	if (
		candidate === "balanced" ||
		candidate === "price" ||
		candidate === "latency" ||
		candidate === "throughput"
	) {
		return candidate;
	}
	const fallbackCandidate = (fallback ?? "").toLowerCase();
	if (
		fallbackCandidate === "balanced" ||
		fallbackCandidate === "price" ||
		fallbackCandidate === "latency" ||
		fallbackCandidate === "throughput"
	) {
		return fallbackCandidate;
	}
	return null;
}
