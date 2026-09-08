type ModelDetail = {
	detail_name: string;
	detail_value: string | number | null;
};

type ModelDescriptionOrganisation = {
	name?: string | null;
};

export type ModelDescriptionSource = {
	model_id: string;
	name?: string | null;
	description?: string | null;
	organisation_id?: string | null;
	organisation?: ModelDescriptionOrganisation | null;
	status?: string | null;
	input_types?: string | string[] | null;
	output_types?: string | string[] | null;
	model_details?: ModelDetail[] | null;
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length > 0 ? normalized : null;
}

export function markdownToPlainText(value: string | null | undefined): string | null {
	const normalized = normalizeText(value);
	if (!normalized) return null;

	return normalizeText(
		normalized
			.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/\*\*([^*]+)\*\*/g, "$1")
			.replace(/\*([^*]+)\*/g, "$1")
			.replace(/__([^_]+)__/g, "$1")
			.replace(/_([^_]+)_/g, "$1")
			.replace(/^#{1,6}\s+/gm, "")
			.replace(/^\s*>\s*/gm, "")
			.replace(/\n+/g, " "),
	);
}

function getDetailValue(
	model: Pick<ModelDescriptionSource, "model_details">,
	detailName: string,
): string | null {
	const detail = model.model_details?.find((item) => item.detail_name === detailName);
	if (!detail) return null;
	return normalizeText(detail.detail_value == null ? null : String(detail.detail_value));
}

function normalizeModality(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

	if (!normalized) return "";
	if (normalized === "embedding") return "embeddings";
	if (normalized === "moderation") return "moderations";
	if (normalized.includes("music")) return "audio_music";
	if (
		normalized.includes("transcri") ||
		normalized.includes("speech_to_text") ||
		normalized.includes("stt")
	) {
		return "audio_stt";
	}
	if (
		normalized.includes("text_to_speech") ||
		normalized.includes("audio_speech") ||
		normalized.includes("speech_synth") ||
		normalized.includes("tts")
	) {
		return "audio_tts";
	}
	return normalized;
}

function parseModalities(value: string | string[] | null | undefined): string[] {
	if (Array.isArray(value)) {
		return Array.from(
			new Set(value.map((item) => normalizeModality(String(item ?? ""))).filter(Boolean)),
		);
	}
	if (typeof value === "string") {
		return Array.from(
			new Set(value.split(",").map((item) => normalizeModality(item)).filter(Boolean)),
		);
	}
	return [];
}

function formatModality(value: string): string {
	switch (value) {
		case "audio_stt":
			return "transcription";
		case "audio_tts":
			return "speech";
		case "audio_music":
			return "music";
		case "embeddings":
			return "embedding";
		case "moderations":
			return "moderation";
		default:
			return value.replace(/_/g, " ");
	}
}

function joinNaturalList(values: string[]): string {
	if (values.length === 0) return "";
	if (values.length === 1) return values[0]!;
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function addSentence(parts: string[], sentence: string | null) {
	const normalized = normalizeText(sentence);
	if (!normalized) return;
	parts.push(/[.!?]$/.test(normalized) ? normalized : `${normalized}.`);
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
	const normalized = normalizeText(value) ?? "";
	if (normalized.length <= maxLength) return normalized;
	const slice = normalized.slice(0, Math.max(0, maxLength - 1));
	const boundary = slice.lastIndexOf(" ");
	const safeSlice = boundary >= Math.floor(maxLength * 0.6) ? slice.slice(0, boundary) : slice;
	return `${safeSlice.trimEnd()}...`;
}

function buildStatusLabel(status: string | null | undefined): string | null {
    switch ((status ?? "").trim().toLowerCase()) {
        case "announced":
            return "an announced";
        case "deprecated":
            return "a deprecated";
        case "retired":
            return "a retired";
        case "limited access":
        case "limited_access":
        case "limited-access":
            return "a limited-access";
        case "withheld":
            return "a withheld";
        case "rumoured":
            return "a rumoured";
        default:
            return "an";
    }
}

function buildModalitySentence(model: ModelDescriptionSource): string | null {
	const inputModalities = parseModalities(model.input_types).map(formatModality);
	const outputModalities = parseModalities(model.output_types).map(formatModality);
	const uniqueInputs = Array.from(new Set(inputModalities));
	const uniqueOutputs = Array.from(new Set(outputModalities));

	if (uniqueInputs.length > 0 && uniqueOutputs.length > 0) {
		return `It accepts ${joinNaturalList(uniqueInputs)} inputs and produces ${joinNaturalList(uniqueOutputs)} outputs`;
	}
	if (uniqueOutputs.length > 0) {
		return `It is designed for ${joinNaturalList(uniqueOutputs)} workloads`;
	}
	if (uniqueInputs.length > 0) {
		return `It accepts ${joinNaturalList(uniqueInputs)} inputs`;
	}
	return null;
}

export function getExplicitModelDescription(
	model: Pick<ModelDescriptionSource, "description" | "model_details">,
): string | null {
	return normalizeText(model.description) ?? getDetailValue(model, "description");
}

export function buildGeneratedModelDescription(
	model: ModelDescriptionSource,
): string {
	const modelName = normalizeText(model.name) ?? model.model_id;
	const organisationName =
		normalizeText(model.organisation?.name) ??
		normalizeText(model.organisation_id) ??
		"the model creator";
	const statusLabel = buildStatusLabel(model.status);

	const sentences: string[] = [];
	addSentence(
		sentences,
		`${modelName} is ${statusLabel} AI model from ${organisationName}`,
	);
	addSentence(sentences, buildModalitySentence(model));

	return sentences.join(" ");
}

export function resolveModelDescription(
	model: ModelDescriptionSource,
): string {
	return getExplicitModelDescription(model) ?? buildGeneratedModelDescription(model);
}

export function buildModelPageMetadataDescription(args: {
	modelDescription?: string | null;
	suffix: string;
	fallback: string;
	maxLength?: number;
}): string {
	const maxLength = args.maxLength ?? 220;
	const description = markdownToPlainText(args.modelDescription);
	const suffix = normalizeText(args.suffix);
	const fallback = normalizeText(args.fallback) ?? "";
	if (!description) {
		return truncateAtWordBoundary(fallback, maxLength);
	}
	const combined = suffix ? `${description} ${suffix}` : description;
	return truncateAtWordBoundary(combined, maxLength);
}

export type ModelOverviewMetadataSignals = {
	providerCount?: number;
	benchmarkCount?: number;
	hasPricing?: boolean;
	contextLength?: number;
};

function formatContextLength(value: number): string {
	if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
	return String(Math.round(value));
}

export function countModelMetadataProviders(
	providers: ReadonlyArray<{ api_provider_id: string }> = [],
): number {
	return new Set(providers.map((provider) => provider.api_provider_id.trim()).filter(Boolean)).size;
}

export function buildModelOverviewMetadataTitle(
	modelName: string,
	signals?: ModelOverviewMetadataSignals,
): string {
	const normalizedName = normalizeText(modelName) ?? "AI Model";
	if (signals) {
		const providerCount = Math.max(0, Math.floor(signals.providerCount ?? 0));
		const benchmarkCount = Math.max(0, Math.floor(signals.benchmarkCount ?? 0));
		const descriptor = signals.hasPricing && providerCount > 0
			? `API Pricing — Compare ${providerCount} Provider${providerCount === 1 ? "" : "s"}`
			: signals.hasPricing
				? "API Pricing"
				: providerCount > 0
					? `API Provider${providerCount === 1 ? "" : "s"}`
					: benchmarkCount > 0
						? "Benchmarks"
						: signals.contextLength && signals.contextLength > 0
							? `${formatContextLength(signals.contextLength)} Context`
							: "AI Model";
			const title = `${normalizedName} ${descriptor} | Phaseo`;
			if (title.length <= 60) return title;
			const compactDescriptor = signals.hasPricing
				? "Pricing"
				: providerCount > 0
					? "Providers"
					: benchmarkCount > 0
						? "Benchmarks"
						: "AI Model";
			const compactTitle = `${normalizedName} ${compactDescriptor} | Phaseo`;
			return compactTitle.length <= 60
				? compactTitle
				: `${truncateAtWordBoundary(normalizedName, 51)} | Phaseo`;
	}
	const detailedTitle = `${normalizedName} Pricing, Benchmarks & Providers`;
	return detailedTitle.length <= 56
		? detailedTitle
		: `${normalizedName} Pricing & Providers`;
}

export function buildModelOverviewMetadataDescription(args: {
	modelName: string;
	organisationName?: string | null;
	modelDescription?: string | null;
	providerCount?: number;
	benchmarkCount?: number;
	hasPricing?: boolean;
}): string {
	const modelName = normalizeText(args.modelName) ?? "this AI model";
	const organisationName = normalizeText(args.organisationName);
	const creatorText = organisationName ? ` from ${organisationName}` : "";
	if (args.modelDescription || args.providerCount != null || args.benchmarkCount != null || args.hasPricing != null) {
		const providerCount = Math.max(0, Math.floor(args.providerCount ?? 0));
		const benchmarkCount = Math.max(0, Math.floor(args.benchmarkCount ?? 0));
		const facts = [
			args.hasPricing && providerCount > 0
				? `compare API pricing across ${providerCount} provider${providerCount === 1 ? "" : "s"}`
				: args.hasPricing
					? "compare API pricing"
					: null,
			benchmarkCount > 0
				? `review ${benchmarkCount} benchmark result${benchmarkCount === 1 ? "" : "s"}`
				: null,
		].filter((fact): fact is string => Boolean(fact));
		const fallback = facts.length > 0
			? `Use Phaseo to ${facts.join(" and ")}${creatorText}.`
			: `Review ${modelName} specifications and API compatibility${creatorText} on Phaseo.`;
		return buildModelPageMetadataDescription({
			modelDescription: args.modelDescription,
			suffix: facts.length > 0 ? `Phaseo can ${facts.join(" and ")}.` : "",
			fallback,
			maxLength: 160,
		});
	}
	return `Compare ${modelName} pricing, providers, benchmark results, latency, and availability. Review specifications and API compatibility${creatorText} on Phaseo.`;
}
