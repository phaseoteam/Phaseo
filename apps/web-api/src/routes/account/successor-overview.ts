// Maps get_workspace_model_successor_overview rows for the Retired model routing settings.

export type SuccessorOverviewModel = {
	model: string;
	name: string | null;
	status: string;
	retiredAt: string | null;
	unservedSince: string | null;
	lastUsedAt: string | null;
	requests: number;
	suggestedReplacement: string | null;
	replacement: string | null;
	replacementName: string | null;
	workspaceOverride: boolean;
	/** The gateway's resolver reason: eligible, within_grace_period, not_approved, no_served_successor, free_to_paid, or never. */
	reason: string | null;
	priceRatio: number | null;
	priceComparable: boolean;
	priceSkippedMeters: string[];
	servedBy: Array<{ model: string; requests: number; lastAt: string | null }>;
};

const text = (value: unknown) => (typeof value === "string" && value ? value : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** Rows of get_workspace_model_successor_overview for the settings page. */
export function successorOverviewFromRows(value: unknown): SuccessorOverviewModel[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((row: any) => {
		const model = text(row?.model);
		if (!model) return [];
		const ratio = row.price_ratio == null ? null : Number(row.price_ratio);
		return [{
			model,
			name: text(row.name),
			status: text(row.status) ?? "active",
			retiredAt: text(row.retired_at),
			unservedSince: text(row.unserved_since),
			lastUsedAt: text(row.last_used_at),
			requests: Number(row.requests) || 0,
			suggestedReplacement: text(row.suggested_replacement),
			replacement: text(row.replacement),
			replacementName: text(row.replacement_name),
			workspaceOverride: row.workspace_override === true,
			reason: text(row.reason),
			priceRatio: ratio != null && Number.isFinite(ratio) ? ratio : null,
			priceComparable: row.price_comparable === true,
			priceSkippedMeters: strings(row.price_skipped_meters),
			servedBy: (Array.isArray(row.served_by) ? row.served_by : []).flatMap((entry: any) => {
				const served = text(entry?.model);
				return served ? [{ model: served, requests: Number(entry.requests) || 0, lastAt: text(entry.last_at) }] : [];
			}),
		}];
	});
}
