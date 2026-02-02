import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type ModelTokenTrajectoryPoint = {
	date: string;
	tokens: number;
	cumulativeTokens: number;
	daysSinceRelease: number;
};

export type ModelTokenMilestone = {
	threshold: number;
	reachedOn: string | null;
	daysSinceRelease: number | null;
};

export type ModelSuccessorMilestone = {
	modelId: string;
	name: string;
	releaseDate: string | null;
	daysSinceRelease: number | null;
};

export type ModelTokenTrajectory = {
	releaseDate: string;
	deprecationDate: string | null;
	deprecationDaysSinceRelease: number | null;
	points: ModelTokenTrajectoryPoint[];
	tokenMilestones: ModelTokenMilestone[];
	successorMilestones: ModelSuccessorMilestone[];
};

type RpcTokenTrajectory = {
	release_date: string | null;
	deprecation_date: string | null;
	points: Array<{
		date: string;
		tokens: number;
		cumulativeTokens: number;
		daysSinceRelease: number;
	}>;
	token_milestones: Array<{
		threshold: number;
		reachedOn: string | null;
		daysSinceRelease: number | null;
	}>;
	successor_milestones: Array<{
		modelId: string;
		name: string;
		releaseDate: string | null;
		daysSinceRelease: number | null;
	}>;
};

function mapTrajectory(row: RpcTokenTrajectory | undefined): ModelTokenTrajectory | null {
	if (!row?.release_date) return null;

	const points = row.points ?? [];
	const deprecationDatePrefix = row.deprecation_date?.slice(0, 10);
	const deprecationDaysSinceRelease = deprecationDatePrefix
		? points.find((p) => p.date.startsWith(deprecationDatePrefix))?.daysSinceRelease ??
		  null
		: null;

	return {
		releaseDate: row.release_date,
		deprecationDate: row.deprecation_date,
		deprecationDaysSinceRelease,
		points,
		tokenMilestones: row.token_milestones ?? [],
		successorMilestones: row.successor_milestones ?? [],
	};
}

export async function getModelTokenTrajectory(
	modelId: string,
	includeHidden: boolean
): Promise<ModelTokenTrajectory | null> {
	const t0 = Date.now();
	const client = createAdminClient();

	const { data: modelRow, error: modelError } = await client
		.from("data_models")
		.select("hidden")
		.eq("model_id", modelId)
		.maybeSingle();

	if (modelError) {
		throw new Error(modelError.message ?? "Failed to load model metadata");
	}
	if (!modelRow || (!includeHidden && modelRow.hidden)) {
		throw new Error("Model not found");
	}

	const { data, error } = await client.rpc("get_model_token_trajectory", {
		p_model_id: modelId,
	});

	const dur = Date.now() - t0;
	console.log(`[tokens] rpc dur=${dur}ms modelId=${modelId}`);

	if (error) {
		throw new Error(error.message ?? "Failed to load token trajectory");
	}

	const row = (data?.[0] as RpcTokenTrajectory | undefined) ?? undefined;
	const result = mapTrajectory(row);
	console.log(`[tokens] result releaseDate=${result?.releaseDate ?? "null"} points=${result?.points.length ?? 0}`);

	return result;
}

export async function getModelTokenTrajectoryCached(
	modelId: string,
	includeHidden: boolean
): Promise<ModelTokenTrajectory | null> {
	"use cache";

	cacheLife("days");
	cacheTag("data:gateway_requests");

	return getModelTokenTrajectory(modelId, includeHidden);
}
