import type { ExperimentsCouncilPresetRecord } from "@/lib/indexeddb/experimentsCouncil";

export const COUNCIL_PRESET_DESCRIPTIONS = {
	intelligence: "High-reasoning model blend for depth and nuance.",
	budget: "Lower-cost blend optimized for fast iteration.",
	custom: "Manually choose up to four source models.",
} as const;

const INTELLIGENCE_CANDIDATES = [
	"anthropic/claude-opus-4.6",
	"openai/gpt-5.4",
	"google/gemini-3.1-pro-preview",
];

const BUDGET_CANDIDATES = [
	"minimax/minimax-m3",
	"deepseek/deepseek-v4-flash",
	"moonshotai/kimi-k2.6",
];

function pickPresetModels(candidates: string[], available: string[]): string[] {
	const picked = candidates.filter((modelId) => available.includes(modelId));
	if (picked.length > 0) return picked.slice(0, 4);
	return available.slice(0, Math.min(3, available.length));
}

export function buildDefaultCouncilPresets(modelIds: string[]): ExperimentsCouncilPresetRecord[] {
	// Keep this deterministic for Server Components / prerender.
	const nowIso = "1970-01-01T00:00:00.000Z";
	const fallback = [...INTELLIGENCE_CANDIDATES, ...BUDGET_CANDIDATES];
	const source = [...new Set((modelIds.length > 0 ? modelIds : fallback).filter(Boolean))];
	const intelligence = pickPresetModels(INTELLIGENCE_CANDIDATES, source);
	const budget = pickPresetModels(BUDGET_CANDIDATES, source);

	return [
		{
			id: -1,
			key: "intelligence",
			name: "Intelligence",
			description: COUNCIL_PRESET_DESCRIPTIONS.intelligence,
			sourceModels: intelligence,
			synthesisModelSlug: (intelligence[0] ?? source[0]) ?? null,
			isSystem: true,
			createdAt: nowIso,
			updatedAt: nowIso,
		},
		{
			id: -2,
			key: "budget",
			name: "Budget",
			description: COUNCIL_PRESET_DESCRIPTIONS.budget,
			sourceModels: budget,
			synthesisModelSlug: (budget[0] ?? source[0]) ?? null,
			isSystem: true,
			createdAt: nowIso,
			updatedAt: nowIso,
		},
		{
			id: -3,
			key: "custom",
			name: "Custom",
			description: COUNCIL_PRESET_DESCRIPTIONS.custom,
			sourceModels: [],
			synthesisModelSlug: null,
			isSystem: false,
			createdAt: nowIso,
			updatedAt: nowIso,
		},
	];
}

