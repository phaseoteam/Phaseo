import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import ByokProviderKeys, { type ByokKeyEntry } from "@/components/(gateway)/settings/byok/ByokProviderKeys";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Button } from "@/components/ui/button";
import { fetchFrontendAPIProviderHeader } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchFrontendAPIProviderModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchSettingsByokInitialData } from "@/lib/fetchers/internal/fetchSettingsByokInitialData";
import { fetchSettingsKeysInitialData } from "@/lib/fetchers/internal/fetchSettingsKeysInitialData";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.byokProviderPageCopy");
	return { title: t("pageTitle") + " - BYOK" };
}

function getOpenAISampleKeys(providerRejectedMessage: string): ByokKeyEntry[] {
	return [
		{ id: "sample-openai-primary", providerId: "openai", name: "Production Primary", prefix: "sk-pro", suffix: "8A2f", lastUsedAt: "2026-08-09T20:42:00.000Z", enabled: true, errorMessage: null, alwaysUse: true, routingMode: "priority", sortOrder: 0, verificationStatus: "format_valid_strict", sample: true },
		{ id: "sample-openai-secondary", providerId: "openai", name: "Production Secondary", prefix: "sk-pro", suffix: "3Kq9", lastUsedAt: "2026-08-08T14:18:00.000Z", enabled: true, errorMessage: null, alwaysUse: true, routingMode: "priority", sortOrder: 1, verificationStatus: "format_valid_strict", sample: true },
		{ id: "sample-openai-fallback", providerId: "openai", name: "Emergency Fallback", prefix: "sk-fal", suffix: "7Mm1", lastUsedAt: null, enabled: true, errorMessage: null, alwaysUse: false, routingMode: "fallback", sortOrder: 0, verificationStatus: "format_valid_strict", sample: true },
		{ id: "sample-openai-paused", providerId: "openai", name: "Previous Billing Key", prefix: "sk-old", suffix: "1Vx4", lastUsedAt: "2026-07-29T09:05:00.000Z", enabled: false, errorMessage: providerRejectedMessage, alwaysUse: false, routingMode: "fallback", sortOrder: 1, verificationStatus: "format_valid_strict", sample: true },
	];
}

export default async function ByokProviderPage({ params, searchParams }: { params: Promise<{ providerId: string }>; searchParams: Promise<{ sampleKeys?: string }> }) {
	const t = await getTranslations("SettingsUI.byokProviderPageCopy");
	const { providerId: encodedProviderId } = await params;
	const { sampleKeys } = await searchParams;
	const providerId = decodeURIComponent(encodedProviderId);
	const [initialData, catalogProvider, providerModels, keysData] = await Promise.all([
		fetchSettingsByokInitialData(),
		fetchFrontendAPIProviderHeader(providerId),
		fetchFrontendAPIProviderModels(providerId),
		fetchSettingsKeysInitialData(),
	]);
	const storedProviderEntries = initialData.keyEntries.filter((entry) => entry.providerId === providerId) as ByokKeyEntry[];
	const providerEntries = providerId === "openai" && sampleKeys === "1"
		? [...storedProviderEntries, ...getOpenAISampleKeys(t("sampleProviderRejected"))]
		: storedProviderEntries;
	if (!catalogProvider && providerEntries.length === 0) notFound();

	const provider = {
		id: providerId,
		name: String(catalogProvider?.api_provider_name ?? providerId),
		logoId: providerId,
	};
	const modelOptions = providerModels
		.filter((model) => model.is_active_gateway !== false)
		.map((model) => ({ value: model.model_id, label: model.model_name || model.model_id }))
		.sort((left, right) => left.label.localeCompare(right.label));
	const apiKeyOptions = (keysData.teamsWithKeys.find((workspace) => workspace.id === keysData.initialWorkspaceId)?.keys ?? [])
		.flatMap((key) => {
			const id = String(key.id ?? "").trim();
			if (!id) return [];
			return [{ value: id, label: String(key.name ?? key.prefix ?? "API key") }];
		})
		.sort((left, right) => left.label.localeCompare(right.label));

	return (
		<div className="mx-auto space-y-8">
			<div>
				<nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label={t("breadcrumb")}>
					<Link href="/settings/byok" className="inline-flex items-center gap-1.5 hover:text-foreground">
						<ArrowLeft className="h-4 w-4" />
						BYOK
					</Link>
				</nav>
				<SettingsPageHeader
					className="mt-5"
					title={t("pageHeading", { provider: provider.name })}
					description={t("pageDescription", { provider: provider.name })}
					actions={
						<Button asChild variant="outline" className="w-full sm:w-auto">
							<Link href={`/api-providers/${encodeURIComponent(provider.id)}`}>
								{t("viewProviderModels")}
								<ExternalLink className="h-3.5 w-3.5" />
							</Link>
						</Button>
					}
				/>
			</div>

			<section className="space-y-6">
				<div>
					<h2 className="text-base font-semibold">{t("providerKeys")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("providerKeysDescription")}
					</p>
				</div>
				<ByokProviderKeys provider={provider} entries={providerEntries} modelOptions={modelOptions} apiKeyOptions={apiKeyOptions} />
			</section>
		</div>
	);
}
