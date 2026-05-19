import type { NormalizedGatewayPluginConfig } from "./types";

export function normalizeGatewayPlugins(input: unknown): NormalizedGatewayPluginConfig[] {
	if (!Array.isArray(input)) return [];

	const byId = new Map<string, NormalizedGatewayPluginConfig>();
	for (const entry of input) {
		if (typeof entry === "string") {
			const id = entry.trim().toLowerCase();
			if (!id) continue;
			byId.set(id, { id, enabled: true, config: {}, preventOverrides: false });
			continue;
		}

		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const raw = entry as Record<string, unknown>;
		const id =
			typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
		if (!id) continue;

		const config: Record<string, unknown> =
			raw.config && typeof raw.config === "object" && !Array.isArray(raw.config)
				? { ...(raw.config as Record<string, unknown>) }
				: {};
		for (const [key, value] of Object.entries(raw)) {
			if (
				key === "id" ||
				key === "enabled" ||
				key === "config" ||
				key === "preventOverrides"
			) {
				continue;
			}
			config[key] = value;
		}

		byId.set(id, {
			id,
			enabled: raw.enabled !== false,
			config,
			preventOverrides: raw.preventOverrides === true,
		});
	}

	return Array.from(byId.values());
}

export function mergeGatewayPlugins(
	base: unknown,
	overrides: unknown,
): NormalizedGatewayPluginConfig[] {
	const merged = new Map<string, NormalizedGatewayPluginConfig>();

	for (const plugin of normalizeGatewayPlugins(base)) {
		merged.set(plugin.id, plugin);
	}

	for (const plugin of normalizeGatewayPlugins(overrides)) {
		const existing = merged.get(plugin.id);
		if (existing?.preventOverrides) continue;
		merged.set(plugin.id, plugin);
	}

	return Array.from(merged.values());
}

export function resolveGatewayPlugins(args: {
	workspaceDefaults?: unknown;
	presetDefaults?: unknown;
	requestPlugins?: unknown;
}): NormalizedGatewayPluginConfig[] {
	return mergeGatewayPlugins(
		mergeGatewayPlugins(args.workspaceDefaults, args.presetDefaults),
		args.requestPlugins,
	);
}
