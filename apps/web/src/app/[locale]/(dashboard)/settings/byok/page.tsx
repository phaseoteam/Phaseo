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
import { getLocale, getTranslations } from "next-intl/server";
import { getLocalizedDocsHref } from "@/lib/docs";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.byok")} - ${t("headers.settings")}` };
}

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

function fmtCompactInt(value: number, locale: string) {
	return new Intl.NumberFormat(locale, { notation: "compact" }).format(value);
}

function toTitleCaseFromId(providerId: string) {
	return providerId
		.split("-")
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function formatUtcDateTime(iso: string, locale: string) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat(locale, {
		timeZone: "UTC",
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

export default async function BYOKPage() {
	const [t, locale] = await Promise.all([
		getTranslations("SettingsUI"),
		getLocale(),
	]);
	return (
		<div className="mx-auto space-y-6">
			<SettingsPageHeader
				title="Bring Your Own Key"
				titleKey="headers.byok"
				description="Connect provider credentials and control how Phaseo routes requests."
				descriptionKey="headers.byokDescription"
				actions={
					<Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
						<Link href={getLocalizedDocsHref(locale, BYOK_GUIDE_HREF)} target="_blank" rel="noreferrer">
							{t("settingsRouteCopy.routingGuide")}
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
	const [t, locale] = await Promise.all([getTranslations("SettingsUI"), getLocale()]);
	const [initialData, providerCatalogData] = await Promise.all([
		fetchSettingsByokInitialData(),
		fetchFrontendAPIProviders(),
	]);

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-xl border border-dashed border-zinc-300/70 p-6 text-sm text-muted-foreground">
				{t("headers.byokWorkspaceRequired")}
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
	const resetAtText = formatUtcDateTime(initialData.nextMonthStartIso, locale) ?? t("byokPageCopy.unknownDate");

	return (
		<div className="space-y-4">
			<section className="space-y-5 border-b pb-6">
				<div>
					<h2 className="text-base font-semibold">{t("byok.monthlyUsage")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("byokPageCopy.monthlyUsageDescription", { freeRequests: fmtCompactInt(BYOK_MONTHLY_FREE_REQUESTS, locale), feePercent: new Intl.NumberFormat(locale).format(BYOK_FEE_PERCENT) })}
					</p>
				</div>
				<div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-8">
					<div>
						<div className="text-sm text-muted-foreground">{t("byok.usedRequests")}</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.monthlyRequestCount, locale)}</div>
					</div>
					<div>
						<div className="text-sm text-muted-foreground">{t("byok.freeRemaining")}</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.freeRemaining, locale)}</div>
					</div>
					<div>
						<div className="text-sm text-muted-foreground">{t("byok.paidTierRequests")}</div>
						<div className="mt-1 text-2xl font-semibold">{fmtCompactInt(initialData.paidTierRequests, locale)}</div>
					</div>
					<div className="sm:col-span-3 text-xs text-muted-foreground">
						{t("byokPageCopy.usageResetsAt")}{" "}
						<ResetWindowHover
							iso={initialData.nextMonthStartIso}
							triggerText={resetAtText + " UTC"}
						/>
						.
					</div>
				</div>
			</section>

			<section className="space-y-2">
				<div className="px-1">
					<h2 className="text-base font-semibold">{t("byok.providerKeys")}</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("byokPageCopy.providerKeysDescription", { maxKeys: new Intl.NumberFormat(locale).format(MAX_BYOK_KEYS_PER_PROVIDER) })}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("byokPageCopy.batchJobsNote")}
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
