import type { SettingsClassifier } from "@/lib/fetchers/internal/settingsTypes";
import type { ClassifierPreset } from "./classifierPresets";
import {
	MAX_VALUES_PER_DIMENSION,
	parseClassifierFields,
	type ClassifierDimension,
	type InputScope,
	type SampleBy,
} from "./requestClassifiers";

// The editor's draft state and its conversion to the API payload. Validation
// is the shared module the settings API and gateway use, so the page reports
// exactly the error the save would return.

export const DEFAULT_CLASSIFIER_MODEL = "google/gemini-2.5-flash-lite";
export const DEFAULT_SAMPLE_PERCENT = "100";

export type DraftValue = { uid: string; value: string; description: string };
export type DraftDimension = {
	uid: string;
	key: string;
	name: string;
	description: string;
	multiple: boolean;
	allowOther: boolean;
	values: DraftValue[];
};
export type ClassifierDraft = {
	name: string;
	description: string;
	enabled: boolean;
	model: string;
	instructions: string;
	dimensions: DraftDimension[];
	/** Percent of requests, as typed (0.01 to 100). */
	samplePercent: string;
	sampleBy: SampleBy;
	includeResponse: boolean;
	keyIds: string[];
	appIds: string[];
	models: string[];
	/** USD per calendar month, as typed; empty for no cap. */
	budgetUsd: string;
};

let uidCounter = 0;
export function nextUid(prefix = "item"): string {
	uidCounter += 1;
	return `${prefix}-${uidCounter}`;
}

export function emptyValue(): DraftValue {
	return { uid: nextUid("value"), value: "", description: "" };
}

export function emptyDimension(): DraftDimension {
	return { uid: nextUid("dimension"), key: "", name: "", description: "", multiple: false, allowOther: true, values: [emptyValue(), emptyValue()] };
}

function draftDimension(dimension: ClassifierDimension): DraftDimension {
	return {
		uid: nextUid("dimension"),
		key: dimension.key,
		name: dimension.name === dimension.key ? "" : dimension.name,
		description: dimension.description ?? "",
		multiple: dimension.multiple,
		allowOther: dimension.allow_other,
		values: dimension.values.map((entry) => ({ uid: nextUid("value"), value: entry.value, description: entry.description ?? "" })),
	};
}

export function emptyDraft(): ClassifierDraft {
	return {
		name: "",
		description: "",
		enabled: true,
		model: DEFAULT_CLASSIFIER_MODEL,
		instructions: "",
		dimensions: [emptyDimension()],
		samplePercent: DEFAULT_SAMPLE_PERCENT,
		sampleBy: "request",
		includeResponse: false,
		keyIds: [],
		appIds: [],
		models: [],
		budgetUsd: "",
	};
}

/** Percent with up to two decimals and no trailing zeros, e.g. 0.25 -> "25". */
export function formatPercent(rate: number): string {
	return String(Math.round(rate * 100 * 100) / 100);
}

export function draftFromClassifier(classifier: SettingsClassifier): ClassifierDraft {
	return {
		name: classifier.name,
		description: classifier.description ?? "",
		enabled: classifier.enabled,
		model: classifier.model,
		instructions: classifier.instructions ?? "",
		dimensions: classifier.dimensions.length ? classifier.dimensions.map(draftDimension) : [emptyDimension()],
		samplePercent: formatPercent(classifier.sample_rate),
		sampleBy: classifier.sample_by,
		includeResponse: classifier.input_scope === "prompt_and_response",
		keyIds: classifier.scope.key_ids ?? [],
		appIds: classifier.scope.app_ids ?? [],
		models: classifier.scope.models ?? [],
		budgetUsd: classifier.monthly_budget_usd == null ? "" : String(classifier.monthly_budget_usd),
	};
}

/** Replaces the dimensions (and empty name and instructions) with a preset's. */
export function applyPreset(draft: ClassifierDraft, preset: ClassifierPreset, presetName: string): ClassifierDraft {
	return {
		...draft,
		name: draft.name.trim() ? draft.name : presetName,
		instructions: draft.instructions.trim() ? draft.instructions : preset.instructions ?? "",
		dimensions: preset.dimensions.map(draftDimension),
	};
}

/** A valid dimension key from a display name: "Cost centre" -> "cost_centre". */
export function keyFromName(name: string): string {
	return name.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
	const next = [...items];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}

export function canAddValue(dimension: DraftDimension): boolean {
	return dimension.values.length < MAX_VALUES_PER_DIMENSION;
}

function dimensionPayload(dimension: DraftDimension) {
	return {
		key: dimension.key.trim(),
		name: dimension.name.trim() || dimension.key.trim(),
		description: dimension.description.trim() || null,
		multiple: dimension.multiple,
		allow_other: dimension.allowOther,
		// Blank rows are editing scaffolding, not values.
		values: dimension.values
			.filter((entry) => entry.value.trim() || entry.description.trim())
			.map((entry) => ({ value: entry.value.trim(), description: entry.description.trim() || null })),
	};
}

export type DraftProblem =
	| { field: "samplePercent" }
	| { field: "budgetUsd" }
	| { field: "api"; message: string };

/** The API payload in API units (sample_rate 0 to 1, monthly_budget_usd). */
export function draftToPayload(draft: ClassifierDraft): { ok: true; payload: Record<string, unknown> } | { ok: false; problem: DraftProblem } {
	const percent = Number(draft.samplePercent.trim());
	if (!draft.samplePercent.trim() || !Number.isFinite(percent) || percent < 0.01 || percent > 100) {
		return { ok: false, problem: { field: "samplePercent" } };
	}
	let budget: number | null = null;
	if (draft.budgetUsd.trim()) {
		budget = Number(draft.budgetUsd.trim().replace(/^\$/, ""));
		if (!Number.isFinite(budget) || budget <= 0 || budget > 1_000_000) return { ok: false, problem: { field: "budgetUsd" } };
	}
	const scope: Record<string, string[]> = {};
	if (draft.keyIds.length) scope.key_ids = draft.keyIds;
	if (draft.appIds.length) scope.app_ids = draft.appIds;
	if (draft.models.length) scope.models = draft.models;
	const payload: Record<string, unknown> = {
		name: draft.name.trim(),
		description: draft.description.trim() || null,
		enabled: draft.enabled,
		model: draft.model.trim(),
		instructions: draft.instructions.trim(),
		dimensions: draft.dimensions.map(dimensionPayload),
		sample_rate: Math.round(percent * 100) / 10_000,
		sample_by: draft.sampleBy,
		input_scope: (draft.includeResponse ? "prompt_and_response" : "prompt") satisfies InputScope,
		scope,
		monthly_budget_usd: budget,
	};
	const parsed = parseClassifierFields(payload);
	if (parsed.ok === false) return { ok: false, problem: { field: "api", message: parsed.message } };
	return { ok: true, payload };
}

/** Matches "dimensions[1].values[0].value ..." so the editor can point at the row. */
export function problemLocation(message: string): { dimension: number | null; value: number | null } {
	const match = /^dimensions\[(\d+)\](?:\.values\[(\d+)\])?/.exec(message);
	return { dimension: match ? Number(match[1]) : null, value: match?.[2] != null ? Number(match[2]) : null };
}

/** US-format dollars; sub-cent amounts keep enough digits to be non-zero. */
export function formatUsd(value: number): string {
	const small = value > 0 && value < 0.01;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: small ? 6 : 2,
	}).format(value);
}

/** The Logs page filtered to one label value. */
export function logsHrefForLabel(key: string, value: string): string {
	return `/settings/usage/logs/requests?${new URLSearchParams({ label_key: key, label_value: value })}`;
}
