import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export type LandingOpenModelIntelEntry = {
	providerId: string;
	name: string;
	model: string;
	/** Homepage comparison values used by the animated model card. */
	latencyMs: number;
	throughputTps: number;
};

export type HomeModelPrice = {
	inputPrice: number;
	outputPrice: number;
};

export type HomeModelPrices = Record<string, HomeModelPrice>;

export const BETA_OPEN_MODEL_INTEL: LandingOpenModelIntelEntry[] = [
	{
		providerId: "openai",
		name: "GPT-6 Astra",
		model: "openai/gpt-6-astra",
		latencyMs: 472,
		throughputTps: 92,
	},
	{
		providerId: "anthropic",
		name: "Claude Fable 5.1",
		model: "anthropic/claude-fable-5.1",
		latencyMs: 548,
		throughputTps: 79,
	},
	{
		providerId: "google",
		name: "Gemini 3.8 Flash",
		model: "google/gemini-3.8-flash",
		latencyMs: 441,
		throughputTps: 101,
	},
	{
		providerId: "minimax",
		name: "MiniMax M3",
		model: "minimax/minimax-m3",
		latencyMs: 388,
		throughputTps: 108,
	},
	{
		providerId: "deepseek",
		name: "DeepSeek V4.1 Flash",
		model: "deepseek/deepseek-v4.1-flash",
		latencyMs: 405,
		throughputTps: 94,
	},
	{
		providerId: "moonshotai",
		name: "Kimi K3",
		model: "moonshotai/kimi-k3",
		latencyMs: 423,
		throughputTps: 89,
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
