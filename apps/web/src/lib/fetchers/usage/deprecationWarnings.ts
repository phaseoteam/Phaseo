import { createClient } from "@/utils/supabase/server";
import {
	applyHiddenFilter,
	resolveIncludeHidden,
} from "@/lib/fetchers/models/visibility";

const RECENT_USAGE_WINDOW_DAYS = 7;
const UPCOMING_WINDOW_DAYS = 90;
const RECENTLY_PASSED_WINDOW_DAYS = 30;

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

export async function getDeprecationWarningsForTeam(
	teamId: string,
): Promise<DeprecationWarning[]> {
	const supabase = await createClient();
	const includeHidden = await resolveIncludeHidden();

	const recentUsageCutoff = new Date(
		Date.now() - RECENT_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();

	const { data: recentModels, error: recentErr } = await supabase
		.from("gateway_requests")
		.select("model_id,created_at")
		.eq("team_id", teamId)
		.gte("created_at", recentUsageCutoff)
		.not("model_id", "is", null)
		.neq("model_id", "")
		.limit(1000);

	if (recentErr) {
		console.error("Failed to fetch recent model usage:", recentErr);
		return [];
	}

	const lastUsedByModelId = new Map<string, string>();
	for (const row of recentModels ?? []) {
		const modelId =
			typeof (row as any)?.model_id === "string" ? (row as any).model_id : null;
		const createdAt =
			typeof (row as any)?.created_at === "string"
				? (row as any).created_at
				: null;
		if (!modelId || !createdAt) continue;

		const previous = lastUsedByModelId.get(modelId);
		if (!previous || new Date(createdAt).getTime() > new Date(previous).getTime()) {
			lastUsedByModelId.set(modelId, createdAt);
		}
	}

	const modelIds = Array.from(
		new Set(
			(recentModels ?? [])
				.map((row: any) =>
					typeof row?.model_id === "string" ? row.model_id : null,
				)
				.filter((value): value is string => Boolean(value)),
		),
	).slice(0, 500);

	if (!modelIds.length) return [];

	const { data: modelsData, error: modelsErr } = await applyHiddenFilter(
		supabase
			.from("data_models")
			.select(
				"model_id,name,organisation_id,deprecation_date,retirement_date,previous_model_id",
			)
			.in("model_id", modelIds),
		includeHidden,
	);

	if (modelsErr) {
		console.error("Failed to fetch model lifecycle metadata:", modelsErr);
		return [];
	}

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

	const warnings: DeprecationWarning[] = (modelsData ?? [])
		.map((model: any) => {
			const deprecationDate = model?.deprecation_date ?? null;
			const retirementDate = model?.retirement_date ?? null;
			const deprecationDaysUntil = calculateDaysUntil(deprecationDate);
			const retirementDaysUntil = calculateDaysUntil(retirementDate);

			return {
				modelId: model?.model_id ?? "",
				modelName: model?.name ?? null,
				organisationId: model?.organisation_id ?? null,
				lastUsedAt: lastUsedByModelId.get(model?.model_id ?? "") ?? null,
				deprecationDate,
				retirementDate,
				deprecationDaysUntil,
				retirementDaysUntil,
				replacementModelId:
					replacementByPreviousModel.get(model?.model_id ?? "") ?? null,
				previousModelId: model?.previous_model_id ?? null,
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
