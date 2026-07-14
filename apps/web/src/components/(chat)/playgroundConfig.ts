import { getRoomScopedStorageKey } from "@/lib/chat/rooms";

// Default favorites use API MODEL ID - NOT internal model ID.
export const FEATURED_MODEL_IDS = [
	"z-ai/glm-5.2",
	"moonshotai/kimi-k2.7-code",
	"anthropic/claude-fable-5",
	"minimax/minimax-m3",
	"anthropic/claude-opus-4.8",
	"spacex-ai/grok-4.3",
	"openai/gpt-5.5",
	"google/gemini-3.1-pro-preview",
];

export const CHAT_DEFAULT_MODEL_IDS = [
	"z-ai/glm-5.2",
	"moonshotai/kimi-k2.7-code",
	"anthropic/claude-fable-5",
	"minimax/minimax-m3",
	"anthropic/claude-opus-4.8",
	"spacex-ai/grok-4.3",
	"openai/gpt-5.5",
	"google/gemini-3.1-pro-preview",
];

export const MODEL_SELECTOR_FAVORITES_STORAGE_KEY = getRoomScopedStorageKey(
	"text",
	"favorite-model-ids",
);

const DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;

export function stripModelDateSuffix(value: string) {
	return value.replace(DATE_SUFFIX_RE, "");
}

export function canonicalizeModelKey(value: string) {
	return value
		.toLowerCase()
		.replace(/[._]+/g, "-")
		.replace(/[^a-z0-9/-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/\/+/g, "/")
		.replace(/-\//g, "/")
		.replace(/\/-/g, "/")
		.replace(/^\/|\/$/g, "")
		.replace(/^-+|-+$/g, "");
}

export function normalizeFavoriteModelId(modelId: string) {
	return canonicalizeModelKey(stripModelDateSuffix(modelId));
}

export function getDefaultFavoriteModelIds() {
	return Array.from(
		new Set(FEATURED_MODEL_IDS.map((modelId) => normalizeFavoriteModelId(modelId))),
	);
}

export function parseModelReleaseDateMs(value: string | null) {
	if (!value) return Number.NEGATIVE_INFINITY;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function compareByReleaseDateDesc<
	T extends {
		releaseDate: string | null;
		label: string;
		modelId: string;
	},
>(a: T, b: T) {
	const releaseDiff =
		parseModelReleaseDateMs(b.releaseDate) - parseModelReleaseDateMs(a.releaseDate);
	if (releaseDiff !== 0) return releaseDiff;
	const labelDiff = a.label.localeCompare(b.label);
	if (labelDiff !== 0) return labelDiff;
	return a.modelId.localeCompare(b.modelId);
}

export function formatModelReleaseDate(value: string | null) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function formatModelReleaseMonth(value: string | null) {
	if (!value) return "Unknown";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Unknown";
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
	});
}

export function groupModelsByReleaseMonth<
	T extends {
		releaseDate: string | null;
	},
>(items: T[]) {
	const groups: Array<{ heading: string; items: T[] }> = [];
	const byHeading = new Map<string, T[]>();
	for (const item of items) {
		const heading = formatModelReleaseMonth(item.releaseDate);
		const existing = byHeading.get(heading);
		if (existing) {
			existing.push(item);
			continue;
		}
		const list = [item];
		byHeading.set(heading, list);
		groups.push({ heading, items: list });
	}
	return groups;
}

export function getCanonicalGatewaySelectorModelId(model: {
	modelId: string;
	internalModelId?: string | null;
}) {
	const baseModelId = model.internalModelId?.trim() || model.modelId;
	if (model.modelId.endsWith(":free") && !baseModelId.endsWith(":free")) {
		return `${baseModelId}:free`;
	}
	return baseModelId;
}
