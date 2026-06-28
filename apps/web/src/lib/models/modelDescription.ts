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
		normalized.includes("transcrib") ||
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
