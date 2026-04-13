import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, Clock3, FileText } from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

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
type LogsViewKey = "logs" | "jobs" | "sessions";

function parseRange(range?: string | null): RangeKey {
	const r = (range ?? "").toLowerCase();
	return r === "1h" || r === "1d" || r === "1w" || r === "1m" || r === "1y"
		? r
		: "1m";
}

function parseView(view?: string | null): LogsViewKey {
	const v = (view ?? "").toLowerCase();
	return v === "logs" || v === "jobs" || v === "sessions" ? v : "logs";
}

function buildViewHref(
	view: LogsViewKey,
	searchParams: Record<string, string | string[] | undefined>,
): string {
	const next = new URLSearchParams();
	for (const [key, rawValue] of Object.entries(searchParams)) {
		if (key === "view") continue;
		if (typeof rawValue === "string") {
			next.set(key, rawValue);
			continue;
		}
		if (Array.isArray(rawValue)) {
			for (const item of rawValue) {
				if (typeof item === "string") next.append(key, item);
			}
		}
	}
	next.set("view", view);
	return `/settings/usage/logs?${next.toString()}`;
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
	const view = parseView(
		typeof sp?.view === "string"
			? sp?.view
			: Array.isArray(sp?.view)
				? sp?.view?.[0]
				: undefined,
	);
	const viewHref = {
		logs: buildViewHref("logs", sp),
		jobs: buildViewHref("jobs", sp),
		sessions: buildViewHref("sessions", sp),
	} as const;

	const viewTabs = [
		{ key: "logs" as const, label: "Logs", icon: FileText, href: viewHref.logs },
		{ key: "jobs" as const, label: "Jobs", icon: Briefcase, href: viewHref.jobs },
		{
			key: "sessions" as const,
			label: "Sessions",
			icon: Clock3,
			href: viewHref.sessions,
		},
	];

	if (view !== "logs") {
		return (
			<div className="space-y-6">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight">Usage Logs</h1>
						<p className="text-sm text-muted-foreground">
							Inspect logs, jobs, and sessions as logging streams expand.
						</p>
					</div>
					<div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-border/70 p-1 md:ml-auto">
						{viewTabs.map((tab) => {
							const Icon = tab.icon;
							const isActive = tab.key === view;
							return (
								<Link
									key={tab.key}
									href={tab.href}
									prefetch={false}
									className={cn(
										"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
										isActive
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									<Icon className="h-4 w-4" />
									{tab.label}
								</Link>
							);
						})}
					</div>
				</div>

				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							{view === "jobs" ? (
								<Briefcase className="h-5 w-5" />
							) : (
								<Clock3 className="h-5 w-5" />
							)}
						</EmptyMedia>
						<EmptyTitle>
							{view === "jobs" ? "Jobs" : "Sessions"} view coming soon
						</EmptyTitle>
						<EmptyDescription>
							This view has been scaffolded and will populate as the new
							logging datasets are wired in.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

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
	const { data: rollupData } = await supabase
		.from("gateway_usage_rollup_15m_team_provider_model")
		.select("canonical_model_id, provider")
		.eq("team_id", teamId)
		.gte("bucket_15m", from)
		.lte("bucket_15m", nowIso);

	const uniqueModels = Array.from(
		new Set((uniqueData ?? []).map((r: any) => r.model_id).filter(Boolean)),
	);
	for (const row of rollupData ?? []) {
		if (typeof row?.canonical_model_id === "string" && row.canonical_model_id.trim().length > 0) {
			uniqueModels.push(row.canonical_model_id.trim());
		}
	}
	const dedupedModels = Array.from(new Set(uniqueModels));
	const uniqueProviders = Array.from(
		new Set((uniqueData ?? []).map((r: any) => r.provider).filter(Boolean)),
	);
	for (const row of rollupData ?? []) {
		if (typeof row?.provider === "string" && row.provider.trim().length > 0) {
			uniqueProviders.push(row.provider.trim());
		}
	}
	const dedupedProviders = Array.from(new Set(uniqueProviders));
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
		for (const row of rollupData ?? []) {
			const modelId =
				typeof row?.canonical_model_id === "string"
					? row.canonical_model_id.trim()
					: null;
			const providerId =
				typeof row?.provider === "string" ? row.provider.trim() : null;
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
		fetchProviderNames(dedupedProviders),
		fetchModelMetadata(dedupedModels),
	]);

	// Keys list for key label rendering inside the logs table.
	const { data: keyRows } = await supabase
		.from("keys")
		.select("id,name,prefix")
		.eq("team_id", teamId)
		.neq("name", CHAT_MANAGED_KEY_NAME)
		.order("created_at", { ascending: true });
	const availableKeys = (keyRows ?? []).map((row: any) => ({
		id: row.id,
		name: row?.name ?? null,
		prefix: row?.prefix ?? null,
	}));

	return (
		<div className="space-y-6">
			<div className="space-y-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight">Usage Logs</h1>
						<p className="text-sm text-muted-foreground">
							Inspect logs, jobs, and sessions as logging streams expand.
						</p>
					</div>
					<div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-border/70 p-1 md:ml-auto">
						{viewTabs.map((tab) => {
							const Icon = tab.icon;
							const isActive = tab.key === view;
							return (
								<Link
									key={tab.key}
									href={tab.href}
									prefetch={false}
									className={cn(
										"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
										isActive
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									<Icon className="h-4 w-4" />
									{tab.label}
								</Link>
							);
						})}
					</div>
				</div>
				<RequestsSection
					timeRange={{ from, to: nowIso }}
					appNames={appNames}
					models={dedupedModels}
					providers={dedupedProviders}
					modelProviders={modelProviders}
					providerNames={providerNames}
					apiKeys={availableKeys}
					modelMetadata={modelMetadata}
				/>
			</div>
		</div>
	);
}
