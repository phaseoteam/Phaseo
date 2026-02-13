import { createClient } from "@/utils/supabase/server";
import {
	applyHiddenFilter,
	resolveIncludeHidden,
} from "@/lib/fetchers/models/visibility";

const RECENT_USAGE_WINDOW_DAYS = 90;
const UPCOMING_WINDOW_DAYS = 90;
// Only show retired models briefly after retirement so the page doesn't stay noisy.
const RECENTLY_PASSED_WINDOW_DAYS = 7;
const ACTIVE_USAGE_WINDOW_DAYS = 90;
const NOTICE_DAYS = 28;
const CRITICAL_DAYS = 7;

export type LifecycleSeverity = "fyi" | "notice" | "warning" | "critical";

export type DeprecationWarning = {
	modelId: string;
	modelName: string | null;
	organisationId: string | null;
	lastUsedAt: string | null;
	deprecationDate: string | null;
	retirementDate: string | null;
	deprecationDaysUntil: number | null;
	retirementDaysUntil: number | null;
	replacementModelId: string | null;
	previousModelId: string | null;
	/**
	 * True when the model has been used since it entered the "14 days remaining" window.
	 * These are the only rows counted towards alert badge numbers.
	 */
	countAsAlert: boolean;
	severity: LifecycleSeverity;
};

function calculateDaysUntil(dateStr: string | null): number | null {
	if (!dateStr) return null;
	const targetDate = new Date(dateStr);
	if (!Number.isFinite(targetDate.getTime())) return null;

	const now = new Date();
	const utcTarget = Date.UTC(
		targetDate.getUTCFullYear(),
		targetDate.getUTCMonth(),
		targetDate.getUTCDate(),
	);
	const utcNow = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	const diffTime = utcTarget - utcNow;
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function isWithinActionWindow(daysUntil: number | null) {
	if (daysUntil === null) return false;
	return (
		daysUntil <= UPCOMING_WINDOW_DAYS &&
		daysUntil >= -RECENTLY_PASSED_WINDOW_DAYS
	);
}

function getUrgencyDays(warning: DeprecationWarning) {
	const candidates = [warning.deprecationDaysUntil, warning.retirementDaysUntil]
		.filter((value): value is number => Number.isFinite(value));
	if (!candidates.length) return Number.POSITIVE_INFINITY;
	return Math.min(...candidates);
}

function getPrimaryDaysUntil(w: Pick<DeprecationWarning, "retirementDaysUntil" | "deprecationDaysUntil">) {
	// Prefer retirement when present, otherwise fall back to deprecation.
	return w.retirementDaysUntil ?? w.deprecationDaysUntil ?? null;
}

function toIsoDaysAgo(daysAgo: number) {
	return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

export async function getDeprecationWarningsForTeam(
	teamId: string,
): Promise<DeprecationWarning[]> {
	const supabase = await createClient();
	const includeHidden = await resolveIncludeHidden();

	// Use YYYY-MM-DD to keep Supabase `.or(...)` filters robust (avoid commas/colons parsing issues).
	const windowStart = new Date(
		Date.now() - RECENTLY_PASSED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	)
		.toISOString()
		.slice(0, 10);
	const windowEnd = new Date(Date.now() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);

	// Pull upcoming retirements/deprecations irrespective of usage.
	// Usage (lastUsedAt) is then joined on top for alert counting + context.
	const { data: lifecycleModels, error: lifecycleErr } = await applyHiddenFilter(
		supabase
			.from("data_models")
			.select(
				"model_id,name,organisation_id,deprecation_date,retirement_date,previous_model_id",
			)
			.or(
				`and(retirement_date.gte.${windowStart},retirement_date.lte.${windowEnd}),and(deprecation_date.gte.${windowStart},deprecation_date.lte.${windowEnd})`,
			),
		includeHidden,
	);

	if (lifecycleErr) {
		console.error("Failed to fetch model lifecycle metadata:", lifecycleErr);
		return [];
	}

	const lifecycleModelIds = Array.from(
		new Set(
			(lifecycleModels ?? [])
				.map((row: any) => (typeof row?.model_id === "string" ? row.model_id : null))
				.filter((value: string | null): value is string => Boolean(value)),
		),
	);

	if (!lifecycleModelIds.length) return [];

	const recentUsageCutoff = new Date(
		Date.now() - RECENT_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();

	// Use RPC to avoid fetching thousands of request rows.
	const { data: recentModels, error: recentErr } = await supabase.rpc(
		"get_team_model_last_used",
		{
			p_team_id: teamId,
			p_since: recentUsageCutoff,
		},
	);

	if (recentErr) {
		// This can happen if migrations haven't been applied yet or RPC permissions are misconfigured.
		// Don't spam opaque objects (`{}`) into console; emit a concise message.
		console.warn(
			"Failed to fetch recent model usage (RPC get_team_model_last_used):",
			(recentErr as any)?.message ?? String(recentErr),
		);
	}

	const recentModelsSafe = recentErr ? [] : (recentModels ?? []);

	// gateway_requests model ids may be API ids (e.g. anthropic/claude-3.5-haiku) while
	// lifecycle metadata lives on internal model ids. Resolve via data_api_provider_models.
	const usedModelIds = Array.from(
		new Set(
			recentModelsSafe
				.map((row: any) =>
					typeof row?.model_id === "string" ? row.model_id : null,
				)
				.filter((value: string | null): value is string => Boolean(value)),
		),
	);

	const lastUsedByUsedId = new Map<string, string>();
	for (const row of recentModelsSafe) {
		const modelId =
			typeof (row as any)?.model_id === "string" ? (row as any).model_id : null;
		const lastUsedAt =
			typeof (row as any)?.last_used_at === "string"
				? (row as any).last_used_at
				: null;
		if (!modelId || !lastUsedAt) continue;
		lastUsedByUsedId.set(modelId, lastUsedAt);
	}

	const usedIdToInternal = new Map<string, string>();

	if (usedModelIds.length) {
		const [{ data: apiRows }, { data: internalRows }, { data: providerApiRows }] =
			await Promise.all([
				supabase
					.from("data_api_provider_models")
					.select("api_model_id, internal_model_id")
					.in("api_model_id", usedModelIds)
					.limit(5000),
				supabase
					.from("data_api_provider_models")
					.select("api_model_id, internal_model_id")
					.in("internal_model_id", usedModelIds)
					.limit(5000),
				supabase
					.from("data_api_provider_models")
					.select("provider_api_model_id, api_model_id, internal_model_id")
					.in("provider_api_model_id", usedModelIds)
					.limit(5000),
			]);

		for (const row of [...(apiRows ?? []), ...(internalRows ?? [])]) {
			const api = (row as any)?.api_model_id;
			const internal = (row as any)?.internal_model_id;
			if (typeof api === "string" && typeof internal === "string") {
				usedIdToInternal.set(api, internal);
			}
		}

		for (const row of providerApiRows ?? []) {
			const providerApiModelId = (row as any)?.provider_api_model_id;
			const apiModelId = (row as any)?.api_model_id;
			const internal = (row as any)?.internal_model_id;
			if (typeof internal !== "string" || !internal) continue;

			if (typeof providerApiModelId === "string" && providerApiModelId) {
				usedIdToInternal.set(providerApiModelId, internal);
			}
			if (typeof apiModelId === "string" && apiModelId) {
				usedIdToInternal.set(apiModelId, internal);
			}
		}
	}

	const lastUsedByInternalModelId = new Map<string, string>();
	for (const [usedId, lastUsedAt] of lastUsedByUsedId.entries()) {
		const internalId = usedIdToInternal.get(usedId) ?? usedId;
		const previous = lastUsedByInternalModelId.get(internalId);
		if (
			!previous ||
			new Date(lastUsedAt).getTime() > new Date(previous).getTime()
		) {
			lastUsedByInternalModelId.set(internalId, lastUsedAt);
		}
	}

	const modelIds = lifecycleModelIds;

	const { data: replacementRows, error: replacementErr } =
		await applyHiddenFilter(
			supabase
				.from("data_models")
				.select("model_id,previous_model_id")
				.in("previous_model_id", modelIds),
			includeHidden,
		);

	if (replacementErr) {
		console.error("Failed to fetch model replacements:", replacementErr);
	}

	const replacementByPreviousModel = new Map<string, string>();
	for (const row of replacementRows ?? []) {
		const previousModelId =
			typeof (row as any)?.previous_model_id === "string"
				? (row as any).previous_model_id
				: null;
		const replacementModelId =
			typeof (row as any)?.model_id === "string"
				? (row as any).model_id
				: null;

		if (
			!previousModelId ||
			!replacementModelId ||
			replacementByPreviousModel.has(previousModelId)
		) {
			continue;
		}

			replacementByPreviousModel.set(previousModelId, replacementModelId);
	}

	const warnings: DeprecationWarning[] = (lifecycleModels ?? [])
		.map((model: any) => {
			const deprecationDate = model?.deprecation_date ?? null;
			const retirementDate = model?.retirement_date ?? null;
			const deprecationDaysUntil = calculateDaysUntil(deprecationDate);
			const retirementDaysUntil = calculateDaysUntil(retirementDate);
			const lastUsedAt =
				lastUsedByInternalModelId.get(model?.model_id ?? "") ?? null;

			const primaryDaysUntil =
				getPrimaryDaysUntil({ retirementDaysUntil, deprecationDaysUntil });

			// Compute count/severity here so callers can show badges consistently.
			let countAsAlert = false;
			let severity: LifecycleSeverity = "fyi";

			if (
				primaryDaysUntil !== null &&
				primaryDaysUntil >= 0 &&
				primaryDaysUntil <= UPCOMING_WINDOW_DAYS
			) {
				// "Models that aren't being used are still displayed just as a FYI - but not included in the alert number count".
				// We treat a model as "active" if it has been used recently.
				const usedRecently =
					Boolean(lastUsedAt) &&
					new Date(lastUsedAt as string).getTime() >=
						new Date(toIsoDaysAgo(ACTIVE_USAGE_WINDOW_DAYS)).getTime();

				countAsAlert = usedRecently;

				// 90-28: notice, 28-7: warning (yellow), 7-0: critical (red)
				severity =
					primaryDaysUntil <= CRITICAL_DAYS
						? "critical"
						: primaryDaysUntil <= NOTICE_DAYS
							? "warning"
							: "notice";

				if (!usedRecently) severity = "fyi";
			}

			return {
				modelId: model?.model_id ?? "",
				modelName: model?.name ?? null,
				organisationId: model?.organisation_id ?? null,
				lastUsedAt,
				deprecationDate,
				retirementDate,
				deprecationDaysUntil,
				retirementDaysUntil,
				replacementModelId:
					replacementByPreviousModel.get(model?.model_id ?? "") ?? null,
				previousModelId: model?.previous_model_id ?? null,
				countAsAlert,
				severity,
			} satisfies DeprecationWarning;
		})
		.filter((warning: DeprecationWarning) => Boolean(warning.modelId))
		.filter(
			(warning: DeprecationWarning) =>
				isWithinActionWindow(warning.deprecationDaysUntil) ||
				isWithinActionWindow(warning.retirementDaysUntil),
		)
		.sort(
			(a: DeprecationWarning, b: DeprecationWarning) =>
				getUrgencyDays(a) - getUrgencyDays(b),
		);

	return warnings;
}
