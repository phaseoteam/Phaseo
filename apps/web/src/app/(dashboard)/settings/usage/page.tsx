import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

import UsageHeader from "@/components/(gateway)/usage/UsageHeader/UsageHeader";
import MetricsOverview from "@/components/(gateway)/usage/MetricsOverview";
import AsyncJobsPanel from "@/components/(gateway)/usage/AsyncJobsPanel";
import {
	fetchAppMetadata,
	fetchChartData,
	fetchRecentAsyncJobs,
	fetchOrganizationColors,
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

	const workspaceId = await getWorkspaceIdFromCookie();

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

	if (!workspaceId) {
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

        const from = fromForRange(range).toISOString();
        const nowIso = new Date().toISOString();

        // Prefer rollup-derived IDs, but union with request-derived IDs so usage
        // metadata still populates when rollups are delayed.
        const [{ data: keyRows }, { data: modelProviderRollups }, { data: requestUniques }] =
                await Promise.all([
                        supabase
                                .from("keys")
                                .select("id,name,prefix")
                                .eq("workspace_id", workspaceId)
                                .neq("status", "deleted")
                                .neq("name", CHAT_MANAGED_KEY_NAME)
                                .order("created_at", { ascending: true }),
                        supabase
                                .from("gateway_usage_rollup_15m_workspace_provider_model")
                                .select("canonical_model_id, provider")
                                .eq("workspace_id", workspaceId)
                                .gte("bucket_15m", from)
                                .lte("bucket_15m", nowIso),
                        supabase
                                .from("gateway_requests")
                                .select("model_id")
                                .eq("workspace_id", workspaceId)
                                .gte("created_at", from)
                                .lte("created_at", nowIso),
                ]);

        const availableKeys: ApiKeyOption[] = (keyRows ?? []).map((row: any) => ({
                id: row.id,
                name: row?.name ?? null,
                prefix: row?.prefix ?? null,
        }));
        if (keyParam && groupBy === "key") {
                activeKey = availableKeys.find((k) => k.id === keyParam) ?? null;
        }

	// Extract unique values for filters
	const uniqueModels = Array.from(
		new Set(
			[
				...(modelProviderRollups ?? []).map((r: any) => r.canonical_model_id),
				...(requestUniques ?? []).map((r: any) => r.model_id),
			].filter(Boolean),
		),
	);
	const [colorMap, modelMetadata, recentAsyncJobs, initialChartData] = await Promise.all([
		fetchOrganizationColors(uniqueModels),
		fetchModelMetadata(uniqueModels),
		fetchRecentAsyncJobs({ limit: 20 }),
		fetchChartData({
			timeRange: { from, to: nowIso },
			range,
			keyFilter: activeKey?.id ?? null,
		}),
	]);
	const asyncJobModelIds = Array.from(
		new Set(
			recentAsyncJobs
				.map((job) => job.model)
				.filter(
					(modelId): modelId is string =>
						typeof modelId === "string" && modelId.trim().length > 0,
				),
		),
	);
	const asyncJobProviderIds = Array.from(
		new Set(
			recentAsyncJobs
				.map((job) => job.provider)
				.filter(
					(providerId): providerId is string =>
						typeof providerId === "string" && providerId.trim().length > 0,
				),
		),
	);
	const asyncJobAppIds = Array.from(
		new Set(
			recentAsyncJobs
				.map((job) => job.app_id)
				.filter(
					(appId): appId is string =>
						typeof appId === "string" && appId.trim().length > 0,
				),
		),
	);
	const [asyncJobProviderNames, asyncJobModelMetadata, asyncJobAppMetadata] = await Promise.all([
		fetchProviderNames(asyncJobProviderIds),
		fetchModelMetadata(asyncJobModelIds),
		fetchAppMetadata(asyncJobAppIds),
	]);

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
				validKeyIds={availableKeys.map((key) => key.id)}
				initialChartData={initialChartData}
			/>

			<AsyncJobsPanel
				initialJobs={recentAsyncJobs}
				providerNames={asyncJobProviderNames}
				modelMetadata={asyncJobModelMetadata}
				appMetadata={asyncJobAppMetadata}
			/>
		</div>
	);
}

