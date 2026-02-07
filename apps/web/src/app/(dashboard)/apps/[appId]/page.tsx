import Link from "next/link";
import type { Metadata } from "next";
import { Activity, BarChart3, ExternalLink } from "lucide-react";
import AppUsageChart from "@/components/(data)/apps/AppUsageChart";
import { ModelLeaderboard } from "@/components/(rankings)/ModelLeaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getAppDetailsCached } from "@/lib/fetchers/apps/getAppDetails";
import {
	type AppUsageRow,
	getAppUsageOverTime,
} from "@/lib/fetchers/apps/getAppUsageOverTime";
import { getModelLeaderboardMetaByIds } from "@/lib/fetchers/rankings/getRankingsData";
import { createAdminClient } from "@/utils/supabase/admin";

type PageProps = {
	params: Promise<{ appId: string }>;
};

function toNumber(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getRowTokens(row: AppUsageRow): number {
	const totalTokens = toNumber(row.usage?.total_tokens);
	if (totalTokens > 0) return totalTokens;

	const inputTokens = toNumber(
		row.usage?.input_text_tokens ?? row.usage?.input_tokens,
	);
	const outputTokens = toNumber(
		row.usage?.output_text_tokens ?? row.usage?.output_tokens,
	);
	return inputTokens + outputTokens;
}

function isSuccessful(row: AppUsageRow): boolean {
	return row.success !== false;
}

function isKnownModelId(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return normalized !== "" && normalized !== "unknown" && normalized !== "other";
}

function getModelLookupVariants(modelId: string): string[] {
	const trimmed = modelId.trim();
	if (!trimmed) return [];

	const variants = new Set<string>([trimmed]);
	const base = trimmed.split(":")[0];
	if (base) {
		variants.add(base);
		variants.add(base.replace(/\./g, "-"));
	}

	if (trimmed.includes("/")) {
		const withoutOrg = trimmed.split("/")[1];
		if (withoutOrg) {
			variants.add(withoutOrg);
			const withoutOrgBase = withoutOrg.split(":")[0];
			if (withoutOrgBase) {
				variants.add(withoutOrgBase);
				variants.add(withoutOrgBase.replace(/\./g, "-"));
			}
		}
	}

	return Array.from(variants).filter(Boolean);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
	const { appId } = await params;
	const app = await getAppDetailsCached(appId);

	if (!app) {
		return {
			title: "App Usage - AI Stats",
			description: "Usage analytics for applications powered by AI Stats Gateway.",
		};
	}

	return {
		title: `${app.title} - App Usage | AI Stats`,
		description: `Usage analytics for ${app.title}, including model usage and request activity over time.`,
	};
}

export default async function Page({ params }: PageProps) {
	const { appId } = await params;
	const app = await getAppDetailsCached(appId);

	if (!app) {
		return (
			<div className="container mx-auto py-8">
				<Card>
					<CardHeader>
						<CardTitle>App not found</CardTitle>
						<CardDescription>
							No app was found for this ID, or the app is no longer public.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const rows4w = await getAppUsageOverTime(appId, "4w");
	const successful4w = rows4w.filter(isSuccessful);

	const rawModelIds = Array.from(
		new Set(
			successful4w
				.map((row) => row.model_id?.trim())
				.filter((value): value is string => Boolean(value && isKnownModelId(value))),
		),
	);
	const providerIds = Array.from(
		new Set(
			successful4w
				.map((row) => row.provider?.trim())
				.filter((value): value is string => Boolean(value)),
		),
	);
	const apiLookupIds = Array.from(
		new Set(rawModelIds.flatMap((id) => getModelLookupVariants(id))),
	);

	const providerToInternalByKey = new Map<string, string>();
	const internalByApi = new Map<string, Set<string>>();

	if (apiLookupIds.length > 0) {
		const supabase = createAdminClient();
		let providerModelsQuery = supabase
			.from("data_api_provider_models")
			.select("provider_id, api_model_id, internal_model_id")
			.in("api_model_id", apiLookupIds)
			.not("internal_model_id", "is", null);

		if (providerIds.length > 0) {
			providerModelsQuery = providerModelsQuery.in("provider_id", providerIds);
		}

		const { data: providerModels } = await providerModelsQuery;
		for (const row of providerModels ?? []) {
			const providerId = row.provider_id?.trim();
			const apiModelId = row.api_model_id?.trim();
			const internalModelId = row.internal_model_id?.trim();
			if (!providerId || !apiModelId || !internalModelId) continue;

			providerToInternalByKey.set(
				`${providerId}:${apiModelId}`,
				internalModelId,
			);

			const current = internalByApi.get(apiModelId) ?? new Set<string>();
			current.add(internalModelId);
			internalByApi.set(apiModelId, current);
		}
	}

	const candidateModelIds = new Set<string>(rawModelIds);
	for (const internalId of providerToInternalByKey.values()) {
		candidateModelIds.add(internalId);
	}
	for (const ids of internalByApi.values()) {
		for (const internalId of ids) {
			candidateModelIds.add(internalId);
		}
	}

	const modelMetaById = await getModelLeaderboardMetaByIds(
		Array.from(candidateModelIds),
	);
	const hasMeta = (modelId: string) =>
		Boolean(modelMetaById[modelId]?.name || modelMetaById[modelId]?.model_id);

	const resolveRowModelId = (row: AppUsageRow): string | null => {
		const rawModelId = row.model_id?.trim() ?? "";
		if (!isKnownModelId(rawModelId)) return null;

		if (hasMeta(rawModelId)) return rawModelId;

		const providerId = row.provider?.trim() ?? "";
		const variants = getModelLookupVariants(rawModelId);

		for (const apiModelId of variants) {
			if (!apiModelId) continue;
			if (providerId) {
				const providerSpecific = providerToInternalByKey.get(
					`${providerId}:${apiModelId}`,
				);
				if (providerSpecific && hasMeta(providerSpecific)) {
					return providerSpecific;
				}
			}

			const globalMatches = internalByApi.get(apiModelId);
			if (globalMatches && globalMatches.size === 1) {
				const only = Array.from(globalMatches)[0];
				if (hasMeta(only)) return only;
			}
		}

		return null;
	};

	const resolvedRows = successful4w
		.map((row) => {
			const resolvedModelId = resolveRowModelId(row);
			if (!resolvedModelId) return null;
			return {
				...row,
				model_id: resolvedModelId,
			};
		})
		.filter((row): row is AppUsageRow => Boolean(row));

	const modelUsage = Array.from(
		resolvedRows.reduce(
			(map, row) => {
				const modelId = row.model_id?.trim() || "unknown";
				const entry = map.get(modelId) ?? { modelId, tokens: 0 };
				entry.tokens += getRowTokens(row);
				map.set(modelId, entry);
				return map;
			},
			new Map<string, { modelId: string; tokens: number }>(),
		).values(),
	).sort((a, b) => b.tokens - a.tokens);

	const allModelIds = Array.from(new Set(modelUsage.map((entry) => entry.modelId)))
		.filter((modelId) => isKnownModelId(modelId) && hasMeta(modelId));

	const modelLabels = Object.fromEntries(
		allModelIds.map((modelId) => [
			modelId,
			modelMetaById[modelId]?.name ?? modelId,
		]),
	);
	const modelColours = Object.fromEntries(
		allModelIds.map((modelId) => [
			modelId,
			modelMetaById[modelId]?.organisation_colour ?? null,
		]),
	);

	const leaderboardEntries = modelUsage
		.filter((entry) => allModelIds.includes(entry.modelId))
		.slice(0, 20)
		.map((entry, index) => {
			const meta = modelMetaById[entry.modelId] ?? null;
			return {
				key: `${entry.modelId}:${index}`,
				model_id: entry.modelId,
				model_name: meta?.name ?? entry.modelId,
				provider_id: null,
				organisation_id: meta?.organisation_id ?? null,
				organisation_name: meta?.organisation_name ?? null,
				organisation_colour: meta?.organisation_colour ?? null,
				tokens: entry.tokens,
				rank: index + 1,
				prev_rank: index + 1,
				trend: "same" as const,
			};
		});

	const appUrl = app.url && app.url !== "about:blank" ? app.url : null;
	const appInitial = app.title?.trim()?.[0]?.toUpperCase() ?? "A";

	return (
		<div className="container mx-auto py-8 space-y-10">
			<section className="space-y-4">
				<div className="flex items-center gap-4">
					<Avatar className="h-16 w-16 rounded-2xl border border-border/60">
						{app.image_url ? (
							<AvatarImage src={app.image_url} alt={app.title} className="object-cover" />
						) : null}
						<AvatarFallback className="rounded-2xl text-lg font-semibold">
							{appInitial}
						</AvatarFallback>
					</Avatar>
					<div className="space-y-2">
						{appUrl ? (
							<Link
								href={appUrl}
								target="_blank"
								rel="noreferrer"
								className="group inline-flex items-center gap-2"
							>
								<h1 className="text-3xl font-bold tracking-tight">{app.title}</h1>
								<ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
							</Link>
						) : (
							<h1 className="text-3xl font-bold tracking-tight">{app.title}</h1>
						)}
						<p className="text-sm text-muted-foreground">
							Public usage trends and model distribution across the last 4 weeks.
						</p>
					</div>
				</div>
			</section>

			<section className="space-y-3">
				<div className="flex items-center gap-2">
					<Activity className="h-5 w-5 text-muted-foreground" />
					<h2 className="text-xl font-semibold leading-8">Usage Over Time</h2>
				</div>
				<AppUsageChart
					rows={resolvedRows}
					windowLabel="Last 4 weeks"
					modelLabels={modelLabels}
					modelColours={modelColours}
				/>
			</section>

			<section className="space-y-3">
				<div className="flex items-center gap-2">
					<BarChart3 className="h-5 w-5 text-muted-foreground" />
					<h2 className="text-xl font-semibold leading-8">Model Usage Leaderboard</h2>
				</div>
				<p className="text-sm text-muted-foreground">
					Ranked by token usage over the last 4 weeks.
				</p>
				<ModelLeaderboard
					dataByRange={{ month: leaderboardEntries }}
					defaultRange="month"
					showRangeControls={false}
				/>
			</section>
		</div>
	);
}
