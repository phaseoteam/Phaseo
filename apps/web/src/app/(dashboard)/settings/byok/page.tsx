import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import ByokProviderRow from "@/components/(gateway)/settings/byok/ByokProviderRow";
import ResetWindowHover from "@/components/(gateway)/settings/byok/ResetWindowHover";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Button } from "@/components/ui/button";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchSettingsByokInitialData } from "@/lib/fetchers/internal/fetchSettingsByokInitialData";
import { MAX_BYOK_KEYS_PER_PROVIDER } from "@/lib/byok/constants";

export const metadata = { title: "BYOK - Settings" };

const BYOK_MONTHLY_FREE_REQUESTS = 250_000;
const BYOK_FEE_PERCENT = 2.5;
const BYOK_GUIDE_HREF = "https://phaseo.app/docs/v1/guides/routing-and-fallbacks#byok-considerations";

type KeyEntry = {
	id: string;
	providerId: string;
	name: string;
	prefix?: string;
	suffix?: string;
	createdAt: string;
	lastUsedAt: string | null;
	enabled: boolean;
	errorMessage: string | null;
	alwaysUse: boolean;
	routingMode: "priority" | "fallback";
	sortOrder: number;
	verificationStatus: string | null;
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
	{ id: "spacex-ai", name: "SpaceXAI", logoId: "spacex-ai" },
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
				title="Bring Your Own Key"
				description="Connect provider credentials and control how Phaseo routes requests."
				actions={
					<Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
						<Link href={BYOK_GUIDE_HREF} target="_blank" rel="noreferrer">
							Routing guide
							<ArrowUpRight className="ml-1 h-4 w-4" />
						</Link>
					</Button>
				}
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

	const keysByProvider = new Map<string, KeyEntry[]>();
	for (const entry of initialData.keyEntries) {
		const entries = keysByProvider.get(entry.providerId) ?? [];
		entries.push(entry);
		keysByProvider.set(entry.providerId, entries);
	}

	const providerCatalog: ProviderItem[] = providerCatalogData
		.filter((provider) => Number(provider.active_models ?? 0) > 0)
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
	const unknownProviders: ProviderItem[] = Array.from(keysByProvider.keys())
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
			<section className="space-y-5 border-b pb-6">
				<div>
					<h2 className="text-base font-semibold">BYOK monthly usage</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{fmtCompactInt(BYOK_MONTHLY_FREE_REQUESTS)} requests per month with no service fee, then {BYOK_FEE_PERCENT}% of provider-equivalent cost.
					</p>
				</div>
				<div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-8">
					<div>
						<div className="text-sm text-muted-foreground">Used requests</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.monthlyRequestCount)}</div>
					</div>
					<div>
						<div className="text-sm text-muted-foreground">Free remaining</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.freeRemaining)}</div>
					</div>
					<div>
						<div className="text-sm text-muted-foreground">Paid-tier requests</div>
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
				</div>
			</section>

			<section className="space-y-2">
				<div className="px-1">
					<h2 className="text-base font-semibold">Provider keys</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						Store and deterministically order up to {MAX_BYOK_KEYS_PER_PROVIDER} credentials per provider. Each request can attempt up to {MAX_BYOK_KEYS_PER_PROVIDER} BYOK credentials across its route.
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Batch jobs use the same priority and fallback provider-key routing as synchronous requests.
					</p>
				</div>

				<div className="rounded-md border divide-y">
					{providerRows.map((provider) => {
						const entries = keysByProvider.get(provider.id) ?? [];
						return (
							<ByokProviderRow
								key={provider.id}
								provider={provider}
								entries={entries}
							/>
						);
					})}
				</div>
			</section>
		</div>
	);
}
