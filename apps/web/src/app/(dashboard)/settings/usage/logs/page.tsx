import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import RequestsSection from "@/components/(gateway)/usage/RequestsSection";
import {
	fetchAppNames,
	fetchModelMetadata,
	fetchProviderNames,
} from "@/app/(dashboard)/gateway/usage/server-actions";

export const metadata: Metadata = {
	title: "Usage Logs - Settings",
};

type RangeKey = "1h" | "1d" | "1w" | "1m" | "1y";

function parseRange(range?: string | null): RangeKey {
	const r = (range ?? "").toLowerCase();
	return r === "1h" || r === "1d" || r === "1w" || r === "1m" || r === "1y"
		? r
		: "1m";
}

export default function Page(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<UsageLogsContent searchParams={props.searchParams} />
		</Suspense>
	);
}

async function UsageLogsContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) redirect("/sign-in");

	const teamId = await getTeamIdFromCookie();
	if (!teamId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Usage Logs</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						You need to be signed in and have a team selected to view logs.
					</p>
				</CardContent>
			</Card>
		);
	}

	const sp = await searchParams;
	const range = parseRange(
		typeof sp?.range === "string"
			? sp?.range
			: Array.isArray(sp?.range)
				? sp?.range?.[0]
				: undefined,
	);

	const nowIso = new Date().toISOString();
	const from = (() => {
		const now = new Date();
		const d = new Date(now);
		if (range === "1h") d.setHours(now.getHours() - 1);
		else if (range === "1d") d.setDate(now.getDate() - 1);
		else if (range === "1w") d.setDate(now.getDate() - 7);
		else if (range === "1m") d.setMonth(now.getMonth() - 1);
		else if (range === "1y") d.setFullYear(now.getFullYear() - 1);
		return d.toISOString();
	})();

	// Fetch unique models/providers/apps for table filters (best-effort)
	const { data: uniqueData } = await supabase
		.from("gateway_requests")
		.select("model_id, provider, app_id")
		.eq("team_id", teamId)
		.gte("created_at", from)
		.lte("created_at", nowIso);

	const uniqueModels = Array.from(
		new Set((uniqueData ?? []).map((r: any) => r.model_id).filter(Boolean)),
	);
	const uniqueProviders = Array.from(
		new Set((uniqueData ?? []).map((r: any) => r.provider).filter(Boolean)),
	);
	const uniqueAppIds = Array.from(
		new Set((uniqueData ?? []).map((r: any) => r.app_id).filter(Boolean)),
	);

	const modelProviders = (() => {
		const providerSetsByModel = new Map<string, Set<string>>();
		for (const row of uniqueData ?? []) {
			const modelId = typeof row?.model_id === "string" ? row.model_id : null;
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

	const [appNames, providerNames, modelMetadata] = await Promise.all([
		fetchAppNames(uniqueAppIds),
		fetchProviderNames(uniqueProviders),
		fetchModelMetadata(uniqueModels),
	]);

	// Keys list for key label rendering inside the logs table.
	const { data: keyRows } = await supabase
		.from("keys")
		.select("id,name,prefix")
		.eq("team_id", teamId)
		.order("created_at", { ascending: true });
	const availableKeys = (keyRows ?? []).map((row: any) => ({
		id: row.id,
		name: row?.name ?? null,
		prefix: row?.prefix ?? null,
	}));

	return (
		<div className="space-y-6">
			<div className="space-y-4">
				<RequestsSection
					title="Logs"
					timeRange={{ from, to: nowIso }}
					appNames={appNames}
					models={uniqueModels}
					providers={uniqueProviders}
					modelProviders={modelProviders}
					providerNames={providerNames}
					apiKeys={availableKeys}
					modelMetadata={modelMetadata}
				/>
			</div>
		</div>
	);
}
