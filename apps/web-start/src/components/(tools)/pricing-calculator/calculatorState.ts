export type CalculatorModelConfig = {
	endpoint: string;
	provider: string;
	pricingPlan: string;
};

export type CalculatorModelSelection = {
	id: string;
	modelId: string;
};

export type CalculatorCatalogModel = {
	modelId: string;
	displayName: string;
	organisationId: string;
	organisationName: string;
	releaseDate?: string | null;
	announcementDate?: string | null;
};

const UTC_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const ENDPOINT_PREFERENCE = [
	"responses",
	"text.generate",
	"chat.completions",
	"messages",
	"text.embed",
	"image.generate",
	"audio.speech",
	"video.generate",
];

export function comparePricingEndpoints(left: string, right: string): number {
	const leftIndex = ENDPOINT_PREFERENCE.indexOf(left);
	const rightIndex = ENDPOINT_PREFERENCE.indexOf(right);
	if (leftIndex !== -1 || rightIndex !== -1) {
		if (leftIndex === -1) return 1;
		if (rightIndex === -1) return -1;
		return leftIndex - rightIndex;
	}
	const leftIsAsync = /batch|async|file/i.test(left);
	const rightIsAsync = /batch|async|file/i.test(right);
	if (leftIsAsync !== rightIsAsync) return leftIsAsync ? 1 : -1;
	return left.localeCompare(right);
}

export function sanitizeRequestMultiplier(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.max(1, Math.trunc(value));
}

export function sanitizePricingTime(value?: string | null): string {
	return value && UTC_TIME_PATTERN.test(value) ? value : "";
}

export function sanitizeMeterInputs(
	value: Record<string, unknown> | null | undefined
): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};

	const sanitized: Record<string, string> = {};
	for (const [meter, rawValue] of Object.entries(value)) {
		if (typeof rawValue !== "string") continue;
		const parsed = Number(rawValue);
		if (rawValue === "" || (Number.isFinite(parsed) && parsed >= 0)) {
			sanitized[meter] = rawValue;
		}
	}
	return sanitized;
}

export function sanitizeModelConfigs(
	value: Record<string, unknown> | null | undefined
): Record<string, CalculatorModelConfig> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};

	const sanitized: Record<string, CalculatorModelConfig> = {};
	for (const [modelId, rawConfig] of Object.entries(value)) {
		if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
			continue;
		}
		const config = rawConfig as Record<string, unknown>;
		if (
			typeof config.endpoint !== "string" ||
			typeof config.provider !== "string" ||
			typeof config.pricingPlan !== "string"
		) {
			continue;
		}
		sanitized[modelId] = {
			endpoint: config.endpoint,
			provider: config.provider,
			pricingPlan: config.pricingPlan,
		};
	}
	return sanitized;
}

export function sanitizeModelSelections(value: unknown): CalculatorModelSelection[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const selections: CalculatorModelSelection[] = [];
	for (const rawSelection of value) {
		if (!rawSelection || typeof rawSelection !== "object" || Array.isArray(rawSelection)) continue;
		const selection = rawSelection as Record<string, unknown>;
		if (typeof selection.id !== "string" || typeof selection.modelId !== "string") continue;
		if (!selection.id || !selection.modelId || seen.has(selection.id)) continue;
		seen.add(selection.id);
		selections.push({ id: selection.id, modelId: selection.modelId });
	}
	return selections;
}

export function createModelSelectionId(
	modelId: string,
	selections: CalculatorModelSelection[]
): string {
	if (!selections.some((selection) => selection.id === modelId)) return modelId;
	let suffix = 2;
	while (selections.some((selection) => selection.id === `${modelId}::${suffix}`)) {
		suffix += 1;
	}
	return `${modelId}::${suffix}`;
}

export function sameStringArray(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
