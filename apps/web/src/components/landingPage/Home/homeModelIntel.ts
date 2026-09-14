import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export type LandingOpenModelIntelEntry = {
	providerId: string;
	name: string;
	model: string;
};

export type HomeModelPrice = {
	inputPrice: number;
	outputPrice: number;
};

export type HomeModelPrices = Record<string, HomeModelPrice>;

/**
 * These values keep the homepage card layout informative without attributing
 * stale measurements to whichever model is currently featured.
 */
export const LANDING_ILLUSTRATIVE_METRICS = {
	latencyMs: 420,
	throughputTps: 100,
} as const;

export const BETA_OPEN_MODEL_INTEL: LandingOpenModelIntelEntry[] = [
	{
		providerId: "openai",
		name: "GPT-6 Astra",
		model: "openai/gpt-6-astra",
	},
	{
		providerId: "anthropic",
		name: "Claude Fable 5.1",
		model: "anthropic/claude-fable-5.1",
	},
	{
		providerId: "google",
		name: "Gemini 3.8 Flash",
		model: "google/gemini-3.8-flash",
	},
	{
		providerId: "minimax",
		name: "MiniMax M3",
		model: "minimax/minimax-m3",
	},
	{
		providerId: "deepseek",
		name: "DeepSeek V4.1 Flash",
		model: "deepseek/deepseek-v4.1-flash",
	},
	{
		providerId: "moonshotai",
		name: "Kimi K3",
		model: "moonshotai/kimi-k3",
	},
];

const HOME_MODEL_IDS = new Set(BETA_OPEN_MODEL_INTEL.map((entry) => entry.model));

export function buildHomeModelPrices(
	models: GatewaySupportedModel[],
): HomeModelPrices {
	const prices: HomeModelPrices = {};

	for (const model of models) {
		if (!model.isAvailable || !HOME_MODEL_IDS.has(model.modelId)) continue;

		const inputPrice = model.inputPricePerMillion;
		const outputPrice = model.outputPricePerMillion;
		if (
			typeof inputPrice !== "number" ||
			!Number.isFinite(inputPrice) ||
			inputPrice < 0 ||
			typeof outputPrice !== "number" ||
			!Number.isFinite(outputPrice) ||
			outputPrice < 0
		) {
			continue;
		}

		const current = prices[model.modelId];
		if (
			!current ||
			inputPrice < current.inputPrice ||
			(inputPrice === current.inputPrice && outputPrice < current.outputPrice)
		) {
			prices[model.modelId] = { inputPrice, outputPrice };
		}
	}

	return prices;
}
