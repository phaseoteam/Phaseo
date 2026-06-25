import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ByokProviderRow from "@/components/(gateway)/settings/byok/ByokProviderRow";
import ResetWindowHover from "@/components/(gateway)/settings/byok/ResetWindowHover";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchSettingsByokInitialData } from "@/lib/fetchers/internal/fetchSettingsByokInitialData";

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
	const [initialData, providerCatalogData] = await Promise.all([
		fetchSettingsByokInitialData(),
		fetchFrontendAPIProviders(),
	]);

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-xl border border-dashed border-zinc-300/70 p-6 text-sm text-muted-foreground">
				Select a workspace to manage BYOK settings.
			</div>
		);
	}

	const keyByProvider = new Map<string, KeyEntry>(
		initialData.keyEntries.map((entry) => [entry.providerId, entry]),
	);

	const providerCatalog: ProviderItem[] = providerCatalogData
		.map((provider) => ({
			id: String(provider.api_provider_id ?? "").trim(),
			name:
				String(provider.api_provider_name ?? "").trim() ||
				String(provider.api_provider_id ?? "").trim(),
			logoId: String(provider.api_provider_id ?? "").trim(),
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
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.monthlyRequestCount)}</div>
					</div>
					<div>
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Free remaining</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.freeRemaining)}</div>
					</div>
					<div>
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Paid-tier requests</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.paidTierRequests)}</div>
					</div>
					<div className="sm:col-span-3 text-xs text-muted-foreground">
						Usage resets at{" "}
						<ResetWindowHover
							iso={initialData.nextMonthStartIso}
							triggerText={`${formatUtcDateTime(initialData.nextMonthStartIso)} UTC`}
						/>
						.
					</div>
				</CardContent>
			</Card>

			<section className="space-y-2">
				<div className="px-1">
					<h2 className="text-base font-semibold">Provider keys</h2>
				</div>

				{initialData.legacyHiddenTotal > 0 ? (
					<Alert>
						<TriangleAlert className="h-4 w-4" />
						<AlertTitle>Legacy duplicate keys detected</AlertTitle>
						<AlertDescription>
							{fmtCompactInt(initialData.legacyHiddenTotal)} legacy key entries are hidden. Only the newest key per provider is editable.
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
