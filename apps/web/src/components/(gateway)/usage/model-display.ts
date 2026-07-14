export type ModelMetadataEntry = {
	organisationId: string;
	organisationName: string;
	modelName?: string;
};

export type ModelMetadataMap = Map<string, ModelMetadataEntry>;

function modelIdVariants(modelId: string): string[] {
	const variants = new Set<string>();

	const add = (value: string | null | undefined) => {
		const v = value?.trim();
		if (!v) return;
		variants.add(v);
		variants.add(v.toLowerCase());
		variants.add(v.replace(/\./g, "-"));
	};

	add(modelId);

	if (modelId.includes("/")) {
		add(modelId.split("/").slice(1).join("/"));
	}

	for (const current of Array.from(variants)) {
		if (current.includes(":")) {
			const parts = current.split(":");
			add(parts[0]);
		}
		if (/:free$/i.test(current)) {
			add(current.replace(/:free$/i, ""));
			add(current.replace(/:free$/i, "-free"));
		} else if (/-free$/i.test(current)) {
			add(current.replace(/-free$/i, ""));
			add(current.replace(/-free$/i, ":free"));
		} else {
			add(`${current}:free`);
			add(`${current}-free`);
		}
	}

	return Array.from(variants);
}

function fallbackModelId(modelId: string): string {
	if (modelId.includes("/")) {
		const noOrg = modelId.split("/").slice(1).join("/");
		if (noOrg) return noOrg;
	}
	return modelId;
}

function looksLikeSlug(value: string): boolean {
	return /[-_/]/.test(value) || value.toLowerCase() === value;
}

function humanizeModelLabel(raw: string): string {
	const cleaned = raw.replace(/^models\//i, "").replace(/\//g, " ").trim();
	if (!cleaned) return raw;
	const tokens = cleaned.split(/[-\s]+/).filter(Boolean);
	const upperTokenMap = new Map<string, string>([
		["gpt", "GPT"],
		["oss", "OSS"],
		["llama", "Llama"],
		["qwen", "Qwen"],
		["gemini", "Gemini"],
		["oai", "OAI"],
		["tts", "TTS"],
		["stt", "STT"],
		["asr", "ASR"],
		["vlm", "VLM"],
		["r1", "R1"],
	]);
	return tokens
		.map((token) => {
			const lower = token.toLowerCase();
			if (upperTokenMap.has(lower)) return upperTokenMap.get(lower)!;
			if (/^\d+(\.\d+)?b$/i.test(token)) return token.toUpperCase();
			if (/^\d+(\.\d+)?$/.test(token)) return token;
			if (/^[a-z]\d+$/i.test(token)) return token.toUpperCase();
			return token.charAt(0).toUpperCase() + token.slice(1);
		})
		.join(" ");
}

function splitFreeSuffix(raw: string): { base: string; isFree: boolean } {
	const value = raw.trim();
	if (!value) return { base: raw, isFree: false };
	if (/:free$/i.test(value)) {
		return { base: value.replace(/:free$/i, ""), isFree: true };
	}
	if (/-free$/i.test(value)) {
		return { base: value.replace(/-free$/i, ""), isFree: true };
	}
	return { base: value, isFree: false };
}

function displayOrganisationName(raw: string | null | undefined): string | null {
	const value = raw?.trim();
	if (!value) return null;
	const lower = value.toLowerCase();
	const known = new Map<string, string>([
		["openai", "OpenAI"],
		["anthropic", "Anthropic"],
		["google", "Google"],
		["google-ai-studio", "Google AI Studio"],
		["meta", "Meta"],
		["mistral", "Mistral"],
		["minimax", "MiniMax"],
		["qwen", "Qwen"],
		["amazon-bedrock", "Amazon Bedrock"],
		["alibaba-cloud", "Alibaba Cloud"],
		["xai", "SpaceXAI"],
		["spacex-ai", "SpaceXAI"],
	]);
	if (known.has(lower)) return known.get(lower)!;
	if (value.includes("/")) return null;
	const tokenKnown = new Map<string, string>([
		["ai", "AI"],
		["api", "API"],
		["ml", "ML"],
		["llm", "LLM"],
	]);
	const words = value
		.split(/[-_]+/)
		.map((word) => word.trim())
		.filter(Boolean)
		.map((word) => {
			const token = tokenKnown.get(word.toLowerCase());
			if (token) return token;
			if (/^\d+$/.test(word)) return word;
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		});
	if (words.length === 0) return value;
	return words.join(" ");
}

export function getModelDisplayName(
	modelId: string | null,
	modelMetadata: ModelMetadataMap,
): string {
	if (!modelId) return "-";

	let matchedMetadata: ModelMetadataEntry | undefined;
	let explicitModelName: string | null = null;
	for (const variant of modelIdVariants(modelId)) {
		const entry = modelMetadata.get(variant);
		if (entry && !matchedMetadata) {
			matchedMetadata = entry;
		}
		const explicit = entry?.modelName?.trim();
		if (explicit && !explicitModelName) {
			explicitModelName = explicit;
		}
	}

	const rawBaseLabel = explicitModelName ?? fallbackModelId(modelId);
	const split = splitFreeSuffix(rawBaseLabel);
	const isFreeVariant = split.isFree || /(:free|-free)$/i.test(modelId);
	const modelLabelCore = looksLikeSlug(split.base)
		? humanizeModelLabel(split.base)
		: split.base;
	const modelLabel = isFreeVariant && !/\(\s*free\s*\)$/i.test(modelLabelCore)
		? `${modelLabelCore} (Free)`
		: modelLabelCore;
	const orgLabel = displayOrganisationName(matchedMetadata?.organisationName);
	if (!orgLabel) return modelLabel;
	if (new RegExp(`^${orgLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "i").test(modelLabel)) {
		return modelLabel;
	}
	return `${orgLabel}: ${modelLabel}`;
}
