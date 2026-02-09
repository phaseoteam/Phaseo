// Purpose: Merge preset configuration with request body
// Why: Presets allow teams to standardize prompts, parameters, and routing
// How: Apply preset defaults, inject system prompts, filter providers

import type { PresetConfig, PresetData, ProviderCandidate } from "./types";
import { normalizeProviderId, normalizeProviderList } from "@/lib/config/providerAliases";

/**
 * Merge preset configuration with request body
 * Preset defaults are applied only if not already present in the request
 * System prompts are prepended to messages
 */
export function mergePresetWithBody(body: any, preset: PresetData): any {
	const config = preset.config;
	const merged = { ...body };

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
