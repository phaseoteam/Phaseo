import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import HomeGatewaySectionClient, {
	type HomeGatewayModelOption,
} from "./HomeGatewaySectionClient";

const FALLBACK_MODEL_OPTIONS: HomeGatewayModelOption[] = [
	{
		id: "openai/gpt-6-astra",
		label: "GPT-6 Astra",
		provider: "OpenAI",
		logoId: "openai",
		description: "Flagship reasoning and production chat workloads.",
	},
	{
		id: "anthropic/claude-fable-5.1",
		label: "Claude Fable 5.1",
		provider: "Anthropic",
		logoId: "anthropic",
		description: "Long-form analysis, writing, and high-context work.",
	},
	{
		id: "google/gemini-3.8-flash",
		label: "Gemini 3.8 Flash",
		provider: "Google",
		logoId: "google",
		description: "Multimodal workflows with broad tool compatibility.",
	},
	{
		id: "deepseek/deepseek-v4.1-flash",
		label: "DeepSeek V4.1 Flash",
		provider: "DeepSeek",
		logoId: "deepseek",
		description: "High-efficiency reasoning for cost-sensitive tasks.",
	},
];

function titleCase(value: string): string {
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

function fallbackLabel(modelId: string): string {
	const leaf = modelId.split("/").pop() ?? modelId;
	return titleCase(leaf.replace(/\b(\d{4}-\d{2}-\d{2}|preview|mini|nano|turbo|latest)\b/gi, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, ""));
}

function capabilitySummary(capabilities: Iterable<string>): string {
	const labels = Array.from(new Set(capabilities))
		.slice(0, 3)
		.map((value) => {
			const normalized = value.trim().toLowerCase();
			return normalized === "decisions.make" || normalized === "decision.make" || normalized === "systemone" || normalized === "system.one" || normalized === "typed.decisions"
				? "Decisions"
				: titleCase(value);
		});
	return labels.join(" | ");
}

function buildModelOptions(models: GatewaySupportedModel[]): HomeGatewayModelOption[] {
	const map = new Map<string, {
		id: string;
		label: string;
		provider: string;
		logoId: string;
		description: string;
		releaseDate: string | null;
		capabilities: Set<string>;
		providers: Set<string>;
	}>();

	for (const model of models) {
		if (!model.isAvailable) continue;
		const existing = map.get(model.modelId);
		const logoId = model.organisationId ?? model.modelId.split("/")[0] ?? "unknown";
		const provider = model.organisationName ?? model.providerName ?? titleCase(logoId);
		const label = (model.modelName ?? "").trim() || fallbackLabel(model.modelId);
		const providerName = model.providerName ?? provider;
		const releaseDate = model.releaseDate ?? model.announcementDate ?? null;

		if (!existing) {
			map.set(model.modelId, {
				id: model.modelId,
				label,
				provider,
				logoId,
				description: providerName,
				releaseDate,
				capabilities: new Set(model.capabilities ?? []),
				providers: new Set([providerName]),
			});
			continue;
		}

		if (!existing.label && label) {
			existing.label = label;
		}
		if (!existing.provider && provider) {
			existing.provider = provider;
		}
		if (!existing.releaseDate && releaseDate) {
			existing.releaseDate = releaseDate;
		}
		existing.providers.add(providerName);
		for (const capability of model.capabilities ?? []) {
			existing.capabilities.add(capability);
		}
	}

	const options = Array.from(map.values()).map((entry) => {
		const providerCount = entry.providers.size;
		const providerSummary = providerCount > 1 ? `${providerCount} gateway providers` : entry.provider;
		const capabilities = capabilitySummary(entry.capabilities);
		return {
			id: entry.id,
			label: entry.label,
			provider: entry.provider,
			logoId: entry.logoId,
			description: capabilities ? `${providerSummary} | ${capabilities}` : providerSummary,
		};
	});

	options.sort((a, b) => {
		if (a.provider === b.provider) {
			return a.label.localeCompare(b.label);
		}
		return a.provider.localeCompare(b.provider);
	});

	return options;
}

export default async function HomeGatewaySection() {
	let modelOptions = FALLBACK_MODEL_OPTIONS;

	try {
		const models = await fetchFrontendGatewayModels();
		const liveOptions = buildModelOptions(models);
		if (liveOptions.length > 0) {
			modelOptions = liveOptions;
		}
	} catch (error) {
		console.warn("[HomeGatewaySection] failed to load gateway models", error);
	}

	return <HomeGatewaySectionClient modelOptions={modelOptions} />;
}
