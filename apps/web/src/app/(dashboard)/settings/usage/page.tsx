import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

import UsageHeader from "@/components/(gateway)/usage/UsageHeader/UsageHeader";
import MetricsOverview from "@/components/(gateway)/usage/MetricsOverview";
import {
	fetchOrganizationColors,
	fetchAppNames,
	fetchModelMetadata,
	fetchProviderNames,
} from "@/app/(dashboard)/gateway/usage/server-actions";

export const metadata: Metadata = {
	title: "Usage - Settings",
};

type RangeKey = "1h" | "1d" | "1w" | "1m" | "1y";

function parseRange(range?: string | null): RangeKey {
	const r = (range ?? "").toLowerCase();
	return r === "1h" || r === "1d" || r === "1w" || r === "1m" || r === "1y"
		? r
		: "1m";
}

type GroupBy = "model" | "key";

function parseGroup(group?: string | null): GroupBy {
	return group === "key" ? "key" : "model";
}

type ApiKeyOption = {
	id: string;
	name: string | null;
	prefix: string | null;
};

function fromForRange(key: RangeKey): Date {
	const now = new Date();
	const d = new Date(now);
	if (key === "1h") d.setHours(now.getHours() - 1);
	else if (key === "1d") d.setDate(now.getDate() - 1);
	else if (key === "1w") d.setDate(now.getDate() - 7);
	else if (key === "1m") d.setMonth(now.getMonth() - 1);
	else if (key === "1y") d.setFullYear(now.getFullYear() - 1);
	return d;
}

export default function Page(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<UsageSettingsContent searchParams={props.searchParams} />
		</Suspense>
	);
}

async function UsageSettingsContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const supabase = await createClient();

	// Check if user signed in
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect("/sign-in");
	}

	const teamId = await getTeamIdFromCookie();

	const sp = await searchParams;
	const range = parseRange(
		typeof sp?.range === "string"
			? sp?.range
			: Array.isArray(sp?.range)
				? sp?.range?.[0]
				: undefined,
	);
	const groupParam =
		typeof sp?.group === "string"
			? sp.group
			: Array.isArray(sp?.group)
				? sp.group?.[0]
				: undefined;
	const groupBy = parseGroup(groupParam);

	// Optional key filter coming from Settings/Keys "Usage" action
	const keyParam =
		typeof sp?.key === "string"
			? sp.key
			: Array.isArray(sp?.key)
				? sp.key?.[0]
				: undefined;
	let activeKey: ApiKeyOption | null = null;

	if (!teamId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Usage</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						You need to be signed in and have a team selected to view usage.
					</p>
				</CardContent>
			</Card>
		);
	}

	const { data: keyRows } = await supabase
		.from("keys")
		.select("id,name,prefix")
		.eq("team_id", teamId)
		.neq("name", CHAT_MANAGED_KEY_NAME)
		.order("created_at", { ascending: true });
	const availableKeys: ApiKeyOption[] = (keyRows ?? []).map((row: any) => ({
		id: row.id,
		name: row?.name ?? null,
		prefix: row?.prefix ?? null,
	}));
	if (keyParam) {
		activeKey = availableKeys.find((k) => k.id === keyParam) ?? null;
	}

	const from = fromForRange(range).toISOString();
	const nowIso = new Date().toISOString();

	// Fetch aggregated data for unique models and providers from team rollups.
	const { data: modelProviderRollups } = await supabase
		.from("gateway_usage_rollup_15m_team_provider_model")
		.select("canonical_model_id, provider")
		.eq("team_id", teamId)
		.gte("bucket_15m", from)
		.lte("bucket_15m", nowIso);

	// Apps are scoped by team membership and activity in app/model rollups.
	const { data: teamApps } = await supabase
		.from("api_apps")
		.select("id")
		.eq("team_id", teamId);
	const teamAppIds = Array.from(
		new Set((teamApps ?? []).map((row: any) => row?.id).filter(Boolean)),
	);
	const { data: appRollups } =
		teamAppIds.length > 0
			? await supabase
					.from("gateway_usage_rollup_15m_app_model")
					.select("app_id")
					.in("app_id", teamAppIds)
					.gte("bucket_15m", from)
					.lte("bucket_15m", nowIso)
			: { data: [] as any[] };

	// Extract unique values for filters
	const uniqueModels = Array.from(
		new Set(
			(modelProviderRollups ?? [])
				.map((r: any) => r.canonical_model_id)
				.filter(Boolean),
		),
	);
	const uniqueProviders = Array.from(
		new Set(
			(modelProviderRollups ?? []).map((r: any) => r.provider).filter(Boolean),
		),
	);
	const uniqueAppIds = Array.from(
		new Set((appRollups ?? []).map((r: any) => r.app_id).filter(Boolean)),
	);
	const modelProviders = (() => {
		const providerSetsByModel = new Map<string, Set<string>>();
		for (const row of modelProviderRollups ?? []) {
			const modelId =
				typeof row?.canonical_model_id === "string" ? row.canonical_model_id : null;
			const providerId = typeof row?.provider === "string" ? row.provider : null;
			if (!modelId || !providerId) continue;
			if (!providerSetsByModel.has(modelId)) {
				providerSetsByModel.set(modelId, new Set<string>());
			}
			providerSetsByModel.get(modelId)!.add(providerId);
		}
		return new Map(
			Array.from(providerSetsByModel.entries()).map(([m, set]) => [
				m,
				Array.from(set),
			]),
		);
	})();

	const [colorMap, appNames, providerNames, modelMetadata] =
		await Promise.all([
			fetchOrganizationColors(uniqueModels),
			fetchAppNames(uniqueAppIds),
			fetchProviderNames(uniqueProviders),
			fetchModelMetadata(uniqueModels),
		]);

	const periodLabel =
		range === "1h"
			? "Last hour"
			: range === "1d"
				? "Last 24 hours"
				: range === "1w"
					? "Last 7 days"
					: range === "1m"
						? "Last 30 days"
						: "Last year";

	return (
		<div className="space-y-6">
			<UsageHeader keys={availableKeys} />

			{activeKey ? (
				<div className="text-sm text-muted-foreground">
					Showing usage for key{" "}
					<span className="font-mono">{activeKey.prefix ?? ""}</span>
					{activeKey.name ? (
						<>
							{" "}
							(<span className="font-medium">{activeKey.name}</span>)
						</>
					) : null}
					.{" "}
					<a className="underline" href="/settings/usage">
						Clear filter
					</a>
				</div>
			) : null}

			<MetricsOverview
				timeRange={{ from, to: nowIso }}
				range={range}
				colorMap={Object.fromEntries(colorMap)}
				modelMetadata={modelMetadata}
			/>

			<Card>
				<CardHeader>
					<CardTitle>Requests</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						{periodLabel}. View detailed request logs on the Logs tab.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

