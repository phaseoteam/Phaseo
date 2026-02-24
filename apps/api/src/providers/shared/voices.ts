// Purpose: Shared provider voice alias helpers.
// Why: Keeps voice normalization and alias mapping consistent across providers.
// How: Normalizes input aliases and resolves them via per-provider maps.

export function normalizeVoiceAlias(value: string): string {
	return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function createVoiceAliasMap(definitions: Array<{ value: string; aliases?: string[] }>): Record<string, string> {
	const map: Record<string, string> = {};
	for (const definition of definitions) {
		const canonical = definition.value.trim();
		if (!canonical) continue;
		map[normalizeVoiceAlias(canonical)] = canonical;
		for (const alias of definition.aliases ?? []) {
			const normalized = normalizeVoiceAlias(alias);
			if (!normalized) continue;
			map[normalized] = canonical;
		}
	}
	return map;
}

export function resolveVoiceAlias(value: string, aliasMap: Record<string, string>): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	return aliasMap[normalizeVoiceAlias(trimmed)] ?? trimmed;
}

