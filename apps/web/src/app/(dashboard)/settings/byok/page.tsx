import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ByokProviderRow from "@/components/(gateway)/settings/byok/ByokProviderRow";
import ResetWindowHover from "@/components/(gateway)/settings/byok/ResetWindowHover";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";

export const metadata = { title: "BYOK - Settings" };

const BYOK_MONTHLY_FREE_REQUESTS = 100_000;
const BYOK_FEE_PERCENT = 3.5;

type KeyEntry = {
	id: string;
	providerId: string;
	name: string;
	prefix?: string;
	suffix?: string;
	createdAt: string;
	enabled: boolean;
	alwaysUse: boolean;
};

type ProviderItem = {
	id: string;
	name: string;
	logoId: string;
};

const FALLBACK_PROVIDERS: ProviderItem[] = [
	{ id: "ai21", name: "AI21", logoId: "ai21" },
	{ id: "alibaba", name: "Alibaba", logoId: "alibaba" },
	{ id: "amazon-bedrock", name: "Amazon Bedrock", logoId: "amazon-bedrock" },
	{ id: "anthropic", name: "Anthropic", logoId: "anthropic" },
	{ id: "atlas-cloud", name: "Atlas Cloud", logoId: "atlas-cloud" },
	{ id: "azure", name: "Azure", logoId: "azure" },
	{ id: "baseten", name: "Baseten", logoId: "baseten" },
	{ id: "cerebras", name: "Cerebras", logoId: "cerebras" },
	{ id: "chutes", name: "Chutes", logoId: "chutes" },
	{ id: "cloudflare", name: "Cloudflare", logoId: "cloudflare" },
	{ id: "cohere", name: "Cohere", logoId: "cohere" },
	{ id: "deepinfra", name: "DeepInfra", logoId: "deepinfra" },
	{ id: "deepseek", name: "DeepSeek", logoId: "deepseek" },
	{ id: "google-ai-studio", name: "Google AI Studio", logoId: "google-ai-studio" },
	{ id: "google-vertex", name: "Google Vertex", logoId: "google-vertex" },
	{ id: "groq", name: "Groq", logoId: "groq" },
	{ id: "minimax", name: "MiniMax", logoId: "minimax" },
	{ id: "mistral", name: "Mistral", logoId: "mistral" },
	{ id: "moonshotai", name: "MoonshotAI", logoId: "moonshotai" },
	{ id: "novitaai", name: "NovitaAI", logoId: "novitaai" },
	{ id: "openai", name: "OpenAI", logoId: "openai" },
	{ id: "parasail", name: "Parasail", logoId: "parasail" },
	{ id: "suno", name: "Suno", logoId: "suno" },
	{ id: "together", name: "Together", logoId: "together" },
	{ id: "weights-and-biases", name: "Weights & Biases", logoId: "weights-and-biases" },
	{ id: "x-ai", name: "xAI", logoId: "x-ai" },
];

function fmtCompactInt(value: number) {
	return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function toTitleCaseFromId(providerId: string) {
	return providerId
		.split("-")
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function formatUtcDateTime(iso: string) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "Unknown";
	return new Intl.DateTimeFormat("en-US", {
		timeZone: "UTC",
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

export default function BYOKPage() {
	return (
		<div className="mx-auto space-y-6">
			<SettingsPageHeader
				title="Bring Your Own Key (BYOK)"
				description="Manage provider credentials and BYOK billing usage."
			/>

			<Suspense fallback={<SettingsSectionFallback />}>
				<ByokProvidersSection />
			</Suspense>
		</div>
	);
}

async function ByokProvidersSection() {
	const supabase = await createClient();
	const currentTeam = await getTeamIdFromCookie();
	if (!currentTeam) {
		return (
			<div className="rounded-xl border border-dashed border-zinc-300/70 p-6 text-sm text-muted-foreground">
				Select a team to manage BYOK settings.
			</div>
		);
	}

	const now = new Date();
	const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
	const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
	const monthStartIso = monthStart.toISOString();
	const nextMonthStartIso = nextMonthStart.toISOString();

	const [
		{ data: byokRows, error: byokError },
		{ data: monthlyUsageRows },
		{ data: providerRowsData, error: providerRowsError },
	] = await Promise.all([
		supabase
			.from("byok_keys")
			.select("id,provider_id,name,prefix,suffix,created_at,enabled,always_use")
			.eq("team_id", currentTeam)
			.order("created_at", { ascending: false }),
		supabase
			.from("team_byok_monthly_usage")
			.select("month_start,request_count")
			.eq("team_id", currentTeam)
			.gte("month_start", monthStartIso)
			.lt("month_start", nextMonthStartIso)
			.order("month_start", { ascending: false })
			.limit(1),
		supabase
			.from("data_api_providers")
			.select("api_provider_id,api_provider_name")
			.order("api_provider_name", { ascending: true }),
	]);

	if (byokError) {
		console.error("[settings/byok] failed to load keys", byokError);
	}
	if (providerRowsError) {
		console.error("[settings/byok] failed to load providers", providerRowsError);
	}

	const keyRows = (byokRows ?? []) as Array<{
		id: string;
		provider_id: string;
		name: string;
		prefix: string | null;
		suffix: string | null;
		created_at: string;
		enabled: boolean;
		always_use: boolean;
	}>;

	const keyByProvider = new Map<string, KeyEntry>();
	const hiddenLegacyCountByProvider = new Map<string, number>();
	for (const row of keyRows) {
		if (!keyByProvider.has(row.provider_id)) {
			keyByProvider.set(row.provider_id, {
				id: row.id,
				providerId: row.provider_id,
				name: row.name,
				prefix: row.prefix ?? undefined,
				suffix: row.suffix ?? undefined,
				createdAt: row.created_at,
				enabled: row.enabled,
				alwaysUse: row.always_use,
			});
			continue;
		}
		hiddenLegacyCountByProvider.set(
			row.provider_id,
			(hiddenLegacyCountByProvider.get(row.provider_id) ?? 0) + 1,
		);
	}

	const providerCatalog: ProviderItem[] = (providerRowsData ?? [])
		.map((row: any) => ({
			id: String(row?.api_provider_id ?? "").trim(),
			name: String(row?.api_provider_name ?? "").trim() || String(row?.api_provider_id ?? "").trim(),
			logoId: String(row?.api_provider_id ?? "").trim(),
		}))
		.filter((provider: ProviderItem) => provider.id.length > 0);
	const baseProviders = providerCatalog.length > 0 ? providerCatalog : FALLBACK_PROVIDERS;

	const knownProviderIds = new Set(baseProviders.map((provider) => provider.id));
	const unknownProviders: ProviderItem[] = Array.from(keyByProvider.keys())
		.filter((providerId) => !knownProviderIds.has(providerId))
		.sort((a, b) => a.localeCompare(b))
		.map((providerId) => ({
			id: providerId,
			name: toTitleCaseFromId(providerId),
			logoId: providerId,
		}));
	const providerRows = [...baseProviders, ...unknownProviders];

	const legacyHiddenTotal = Array.from(hiddenLegacyCountByProvider.values()).reduce((sum, count) => sum + count, 0);
	const monthlyRequestCount = Number(monthlyUsageRows?.[0]?.request_count ?? 0);
	const freeRemaining = Math.max(0, BYOK_MONTHLY_FREE_REQUESTS - monthlyRequestCount);
	const paidTierRequests = Math.max(0, monthlyRequestCount - BYOK_MONTHLY_FREE_REQUESTS);

	return (
		<div className="space-y-4">
			<Card className="rounded-2xl">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">BYOK monthly usage</CardTitle>
					<p className="text-xs text-muted-foreground">
						{fmtCompactInt(BYOK_MONTHLY_FREE_REQUESTS)} free requests per month, then {BYOK_FEE_PERCENT}% service fee on provider-equivalent cost.
					</p>
				</CardHeader>
				<CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div>
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Used requests</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(monthlyRequestCount)}</div>
					</div>
					<div>
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Free remaining</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(freeRemaining)}</div>
					</div>
					<div>
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Paid-tier requests</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(paidTierRequests)}</div>
					</div>
					<div className="sm:col-span-3 text-xs text-muted-foreground">
						Usage resets at{" "}
						<ResetWindowHover
							iso={nextMonthStartIso}
							triggerText={`${formatUtcDateTime(nextMonthStartIso)} UTC`}
						/>
						.
					</div>
				</CardContent>
			</Card>

			<section className="space-y-2">
				<div className="px-1">
					<h2 className="text-base font-semibold">Provider keys</h2>
				</div>

				{legacyHiddenTotal > 0 ? (
					<Alert>
						<TriangleAlert className="h-4 w-4" />
						<AlertTitle>Legacy duplicate keys detected</AlertTitle>
						<AlertDescription>
							{fmtCompactInt(legacyHiddenTotal)} legacy key entries are hidden. Only the newest key per provider is editable.
						</AlertDescription>
					</Alert>
				) : null}

				<div className="rounded-md border divide-y">
					{providerRows.map((provider) => {
						const entry = keyByProvider.get(provider.id) ?? null;
						return (
							<ByokProviderRow
								key={provider.id}
								provider={provider}
								entry={entry}
							/>
						);
					})}
				</div>
			</section>
		</div>
	);
}
