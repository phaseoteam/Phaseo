// Request classifiers write their answers onto requests as ordinary labels. The
// usage and logs pages show them by the classifier's display names, so this
// reads a minimal summary of each classifier: its name and each dimension's
// key, name and allowed values. It never returns instructions, the model,
// sampling, scope or budget, which stay admin-only behind the management API,
// so any workspace member who can already see the labels on requests can read it.

/** The label the gateway puts on each classifier call, with the classifier id as its value. */
export const CLASSIFIER_CALL_LABEL_KEY = "phaseo.classifier";
/** The value a dimension with allow_other answers when nothing in its list fits. */
const OTHER_VALUE = "other";
const MAX_CLASSIFIERS = 20;

export type RequestClassifierSummary = {
	id: string;
	name: string;
	enabled: boolean;
	dimensions: Array<{ key: string; name: string; multiple: boolean; values: string[] }>;
};

type ClassifierRowLike = { id?: unknown; name?: unknown; enabled?: unknown; dimensions?: unknown };

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Keeps only display fields from a stored classifier row, dropping anything malformed. */
export function summarizeRequestClassifier(row: ClassifierRowLike): RequestClassifierSummary | null {
	const id = text(row.id);
	const name = text(row.name);
	if (!id || !name) return null;
	const dimensions: RequestClassifierSummary["dimensions"] = [];
	for (const raw of Array.isArray(row.dimensions) ? row.dimensions : []) {
		const dimension = (raw ?? {}) as Record<string, unknown>;
		const key = text(dimension.key);
		if (!key) continue;
		const values = (Array.isArray(dimension.values) ? dimension.values : [])
			.map((entry) => text(typeof entry === "string" ? entry : (entry as Record<string, unknown> | null)?.value))
			.filter((value): value is string => Boolean(value));
		if (dimension.allow_other === true && !values.includes(OTHER_VALUE)) values.push(OTHER_VALUE);
		dimensions.push({ key, name: text(dimension.name) ?? key, multiple: dimension.multiple === true, values: [...new Set(values)] });
	}
	return { id, name, enabled: row.enabled !== false, dimensions };
}

type ClassifierClient = {
	from: (table: string) => any;
};

/**
 * The workspace's classifiers, oldest first (the order the gateway runs them in).
 * Read with the service client: the table has no client policies. An error
 * returns an empty list so the pages still load with raw label keys.
 */
export async function loadRequestClassifierSummaries(client: ClassifierClient, workspaceId: string): Promise<RequestClassifierSummary[]> {
	try {
		const { data, error } = await client.from("workspace_request_classifiers")
			.select("id,name,enabled,dimensions")
			.eq("workspace_id", workspaceId)
			.order("created_at", { ascending: true })
			.order("id", { ascending: true })
			.limit(MAX_CLASSIFIERS);
		if (error) throw error;
		return ((data ?? []) as ClassifierRowLike[]).map(summarizeRequestClassifier).filter((row): row is RequestClassifierSummary => Boolean(row));
	} catch (error) {
		console.warn("[web-api/usage] request classifiers unavailable", { workspaceId, error: error instanceof Error ? error.message : String(error) });
		return [];
	}
}

export const REQUEST_LABEL_KEY = /^[A-Za-z0-9_.:-]+$/;

/**
 * A request label filter. value null means "the key has any value". exclude
 * flips it: "the key does not have this value", or "the key is not set".
 */
export type RequestLabelFilter = { key: string; value: string | null; exclude: boolean };

/**
 * Reads label_key, label_value and label_op. Logs accept every shape; the usage
 * overview reads a rollup keyed by exact key and value, so it only accepts that.
 */
export function parseRequestLabelFilter(url: URL, options: { exactOnly?: boolean } = {}): RequestLabelFilter | { error: string } | null {
	const key = url.searchParams.get("label_key")?.trim() || null;
	const value = url.searchParams.get("label_value")?.trim() || null;
	const exclude = url.searchParams.get("label_op") === "is_not";
	if (!key && !value) return null;
	if (!key) return { error: "label_value needs a label_key" };
	if (key.length > 64 || !REQUEST_LABEL_KEY.test(key)) return { error: "label_key is invalid" };
	if (value && value.length > 256) return { error: "label_value is too long" };
	if (options.exactOnly && (!value || exclude)) return { error: "usage can only be filtered to one label value" };
	return { key, value, exclude };
}

/** Whether the filter is one exact key and value, which the label rollup can total. */
export function isExactLabelFilter(filter: RequestLabelFilter | null): filter is RequestLabelFilter & { value: string } {
	return Boolean(filter && filter.value && !filter.exclude);
}

/**
 * Applies the filter with jsonb containment on detail_metadata, the same
 * per-row check the existing key and value filter uses; "any value" and
 * "is not" cost the same. NOT on a null column is null rather than true, so
 * "is not" names requests without metadata explicitly.
 */
export function applyRequestLabelFilter<Q extends { contains: (column: string, value: any) => Q; or: (filters: string) => Q }>(query: Q, filter: RequestLabelFilter | null): Q {
	if (!filter) return query;
	const label = filter.value == null ? { key: filter.key } : { key: filter.key, value: filter.value };
	if (!filter.exclude) return query.contains("detail_metadata", { labels: [label] });
	// Quoted so commas and parentheses in a label value stay part of the value.
	const quoted = JSON.stringify(JSON.stringify({ labels: [label] }));
	return query.or(`detail_metadata.is.null,detail_metadata.not.cs.${quoted}`);
}

/** Builds a filter from pagination params, ignoring anything malformed rather than failing the page. */
export function requestLabelFilterFromParams(params: { labelKey?: string | null; labelValue?: string | null; labelOperator?: string | null }): RequestLabelFilter | null {
	const key = params.labelKey?.trim() || null;
	if (!key || key.length > 64 || !REQUEST_LABEL_KEY.test(key)) return null;
	const value = params.labelValue?.trim() || null;
	if (value && value.length > 256) return null;
	return { key, value, exclude: params.labelOperator === "is_not" };
}

/** Classifier ids a request detail refers to, from its classifications and its classifier-call label. */
export function classifierIdsInDetail(detailMetadata: unknown): string[] {
	const metadata = (detailMetadata && typeof detailMetadata === "object" ? detailMetadata : {}) as Record<string, unknown>;
	const ids = new Set<string>();
	for (const outcome of Array.isArray(metadata.classifications) ? metadata.classifications : []) {
		const id = text((outcome as Record<string, unknown> | null)?.classifier_id);
		if (id) ids.add(id);
	}
	for (const label of Array.isArray(metadata.labels) ? metadata.labels : []) {
		const record = (label ?? {}) as Record<string, unknown>;
		const id = record.key === CLASSIFIER_CALL_LABEL_KEY ? text(record.value) : null;
		if (id) ids.add(id);
	}
	return [...ids];
}

/** Rows of get_private_usage_label_breakdown, with numbers coerced. */
export type UsageLabelBreakdownRow = {
	value: string;
	requests: number;
	successfulRequests: number;
	costNanos: number;
	tokens: number;
	inputTokens: number;
	outputTokens: number;
};

export function parseUsageLabelBreakdown(data: unknown): UsageLabelBreakdownRow[] {
	const number = (value: unknown) => {
		const parsed = Number(value ?? 0);
		return Number.isFinite(parsed) ? parsed : 0;
	};
	return (Array.isArray(data) ? data : []).flatMap((raw) => {
		const row = (raw ?? {}) as Record<string, unknown>;
		if (typeof row.value !== "string") return [];
		return [{
			value: row.value,
			requests: number(row.requests),
			successfulRequests: number(row.successfulRequests),
			costNanos: number(row.costNanos),
			tokens: number(row.tokens),
			inputTokens: number(row.inputTokens),
			outputTokens: number(row.outputTokens),
		}];
	});
}
