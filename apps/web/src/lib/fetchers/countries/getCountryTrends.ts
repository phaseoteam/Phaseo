import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";

export interface ReleaseSharePoint {
	monthStart: string;
	countryReleases: number;
	globalReleases: number;
	share: number;
}

export interface ReleaseGapByOrg {
	organisationId: string;
	organisationName: string;
	countryCode: string;
	releases: number;
	medianGapDays: number | null;
	p90GapDays: number | null;
}

export interface ReleaseGapSummary {
	medianGapDays: number | null;
	p90GapDays: number | null;
	sampleSize: number;
}

export interface MonthlyReleaseShare {
	monthStart: string;
	iso: string;
	releases: number;
	globalReleases: number;
}

export async function getCountryReleaseShare(
	iso: string,
	months = 12
): Promise<ReleaseSharePoint[]> {
	"use cache";
	cacheLife("hours");
	cacheTag("countries:release-share");
	cacheTag(`countries:release-share:${iso.toUpperCase()}`);

	const client = createAdminClient();
	const { data, error } = await client.rpc("get_country_release_share", {
		p_iso: iso,
		p_months: months,
	});

	if (error) {
		throw new Error(error.message ?? "Failed to load country release share");
	}

	return (data ?? []).map((row: any) => ({
		monthStart: row.month_start,
		countryReleases: row.country_releases ?? 0,
		globalReleases: row.global_releases ?? 0,
		share: Number(row.share ?? 0),
	}));
}

export async function getMonthlyReleaseShareAll(
	months = 12
): Promise<MonthlyReleaseShare[]> {
	"use cache";
	cacheLife("hours");
	cacheTag("countries:release-share:all");

	const client = createAdminClient();
	const { data, error } = await client.rpc(
		"get_monthly_release_share_all",
		{
			p_months: months,
		}
	);

	if (error) {
		throw new Error(error.message ?? "Failed to load release share");
	}

	return (data ?? []).map((row: any) => ({
		monthStart: row.month_start,
		iso: (row.iso ?? "").toLowerCase(),
		releases: row.releases ?? 0,
		globalReleases: row.global_releases ?? 0,
	}));
}

export async function getReleaseGapsByOrg(
	iso?: string | null
): Promise<ReleaseGapByOrg[]> {
	"use cache";
	cacheLife("hours");
	cacheTag("countries:release-gaps");
	if (iso) cacheTag(`countries:release-gaps:${iso.toUpperCase()}`);

	const client = createAdminClient();
	const { data, error } = await client.rpc("get_release_gaps_by_org", {
		p_iso: iso ?? null,
	});

	if (error) {
		throw new Error(error.message ?? "Failed to load release gap stats");
	}

	return (data ?? []).map((row: any) => ({
		organisationId: row.organisation_id,
		organisationName: row.organisation_name ?? row.organisation_id,
		countryCode: row.country_code ?? "",
		releases: row.releases ?? 0,
		medianGapDays:
			row.median_gap_days !== null ? Number(row.median_gap_days) : null,
		p90GapDays:
			row.p90_gap_days !== null ? Number(row.p90_gap_days) : null,
	}));
}

export function summariseGaps(
	rows: ReleaseGapByOrg[]
): ReleaseGapSummary {
	const medians = rows
		.map((row) => row.medianGapDays)
		.filter(
			(value): value is number =>
				typeof value === "number" && !Number.isNaN(value)
		)
		.sort((a, b) => a - b);

	const p90s = rows
		.map((row) => row.p90GapDays)
		.filter(
			(value): value is number =>
				typeof value === "number" && !Number.isNaN(value)
		)
		.sort((a, b) => a - b);

	const percentile = (values: number[], p: number): number | null => {
		if (!values.length) return null;
		const idx = (values.length - 1) * p;
		const lower = Math.floor(idx);
		const upper = Math.ceil(idx);
		if (lower === upper) return values[lower] ?? null;
		const weight = idx - lower;
		return values[lower] * (1 - weight) + values[upper] * weight;
	};

	return {
		medianGapDays: percentile(medians, 0.5),
		p90GapDays: percentile(p90s, 0.9),
		sampleSize: rows.length,
	};
}
