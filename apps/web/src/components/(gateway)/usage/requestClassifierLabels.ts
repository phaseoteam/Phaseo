// Request classifiers write their answers as ordinary request labels. These
// helpers put names on them: a classifier dimension's label key shows as the
// dimension's name, and the phaseo.classifier label on classifier calls shows
// the classifier's name instead of its id.

import type { RequestClassifierSummary, UsageLabelFacet } from "@/lib/fetchers/internal/settingsTypes";

export type { RequestClassifierSummary };

/** The label the gateway puts on each classifier call; its value is the classifier id. */
export const CLASSIFIER_CALL_LABEL_KEY = "phaseo.classifier";


/** One label key in a picker, with the values to suggest for it. */
export type LabelKeyOption = {
	key: string;
	/** The dimension or classifier-calls name to show, or null to show the key. */
	name: string | null;
	kind: "classifier" | "classifier_calls" | "caller";
	/** The classifier the dimension belongs to. */
	classifierName: string | null;
	values: Array<{ value: string; label: string; seen: boolean }>;
};

/** Each dimension key mapped to the first classifier that defines it, as the gateway resolves overlaps. */
export function classifierDimensionsByKey(classifiers: RequestClassifierSummary[]) {
	const byKey = new Map<string, { classifier: RequestClassifierSummary; dimension: RequestClassifierSummary["dimensions"][number] }>();
	for (const classifier of classifiers) {
		for (const dimension of classifier.dimensions) {
			if (!byKey.has(dimension.key)) byKey.set(dimension.key, { classifier, dimension });
		}
	}
	return byKey;
}

export function classifierNameById(classifiers: RequestClassifierSummary[]) {
	return new Map(classifiers.map((classifier) => [classifier.id, classifier.name]));
}

/**
 * Every label key worth offering: classifier dimensions first (with their
 * allowed values even before any request carries them), then classifier calls,
 * then the caller's own keys seen in the range. Values seen in the range are
 * marked so the picker can show them first.
 */
export function buildLabelKeyOptions(facets: UsageLabelFacet[], classifiers: RequestClassifierSummary[]): LabelKeyOption[] {
	const seenByKey = new Map<string, string[]>();
	for (const facet of facets) seenByKey.set(facet.key, [...(seenByKey.get(facet.key) ?? []), facet.value]);
	const dimensions = classifierDimensionsByKey(classifiers);
	const names = classifierNameById(classifiers);
	const options: LabelKeyOption[] = [];
	const valuesFor = (key: string, allowed: string[], label: (value: string) => string = (value) => value) => {
		const seen = seenByKey.get(key) ?? [];
		const ordered = [...new Set([...seen, ...allowed])];
		return ordered.map((value) => ({ value, label: label(value), seen: seen.includes(value) }));
	};
	for (const [key, { classifier, dimension }] of dimensions) {
		if (key === CLASSIFIER_CALL_LABEL_KEY) continue;
		options.push({ key, name: dimension.name, kind: "classifier", classifierName: classifier.name, values: valuesFor(key, dimension.values) });
	}
	if (classifiers.length || seenByKey.has(CLASSIFIER_CALL_LABEL_KEY)) {
		options.push({
			key: CLASSIFIER_CALL_LABEL_KEY,
			name: null,
			kind: "classifier_calls",
			classifierName: null,
			values: valuesFor(CLASSIFIER_CALL_LABEL_KEY, classifiers.map((classifier) => classifier.id), (id) => names.get(id) ?? id),
		});
	}
	const callerKeys = [...seenByKey.keys()].filter((key) => key !== CLASSIFIER_CALL_LABEL_KEY && !dimensions.has(key)).sort((left, right) => left.localeCompare(right));
	for (const key of callerKeys) options.push({ key, name: null, kind: "caller", classifierName: null, values: valuesFor(key, []) });
	return options;
}

/** How to show a label's value: classifier calls show the classifier's name. */
export function labelValueDisplay(key: string, value: string, classifiers: RequestClassifierSummary[]): string {
	if (key !== CLASSIFIER_CALL_LABEL_KEY) return value;
	return classifiers.find((classifier) => classifier.id === value)?.name ?? value;
}

/** Money as `$12.50` whatever the reader's locale; amounts under a cent keep two significant digits (`$0.000042`). */
export function formatUsd(nanos: number): string {
	const dollars = Number.isFinite(nanos) ? nanos / 1e9 : 0;
	const small = dollars !== 0 && Math.abs(dollars) < 0.01;
	return new Intl.NumberFormat("en-US", small
		? { style: "currency", currency: "USD", maximumSignificantDigits: 2 }
		: { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 },
	).format(dollars);
}

/** Params that pick one request, an open request sheet or a page; a label link drops them and keeps the rest (time range, other filters). */
const LABEL_LINK_DROPPED_PARAMS = ["label_key", "label_value", "label_op", "req", "request", "cursor", "page"];

/** The request logs filtered to one label value, keeping the reader's other filters. */
export function labelFilterHref(key: string, value: string, searchParams?: URLSearchParams | null): string {
	const next = new URLSearchParams(searchParams?.toString() ?? "");
	for (const param of LABEL_LINK_DROPPED_PARAMS) next.delete(param);
	next.set("label_key", key);
	next.set("label_value", value);
	return `/settings/usage/logs/requests?${next}`;
}
