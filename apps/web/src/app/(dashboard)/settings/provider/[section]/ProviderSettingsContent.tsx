"use client";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { redirect } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { useLocale } from "next-intl";
import ProviderCatalogManager from "@/components/(gateway)/settings/account/ProviderCatalogManager";
import ProviderIntegrationSummary from "@/components/(gateway)/settings/account/ProviderIntegrationSummary";
export default function ProviderSettingsContent({ section }: { section: string }) {
	return <PrivateSettingsQuery<SettingsProviderOnboardingInitialData> path="/api/account/settings/provider-onboarding" workspace={false}>{(data) => <ProviderSettingsView section={section} data={data} />}</PrivateSettingsQuery>;
}

function ProviderSettingsView({ section, data }: { section: string; data: SettingsProviderOnboardingInitialData }) {
	const t = useTranslations("SettingsUI");
	const td = useTranslations("SettingsUI.providerDashboard");
 const locale = useLocale();
 const translatedStatus = (group: string, value: string) => { const key = `identity.${group}.${value}`; return t.has(key as never) ? t(key as never) : t(`identity.${group}.other` as never); };
	if (!["models", "review", "integrations"].includes(section)) notFound();
	if (!data.signedIn) redirect({ href: "/sign-in", locale });
	if (!data.catalogProviders.length) redirect({ href: "/settings/account/providers", locale });
	const title = section === "models" ? t("internalMainCopy.yourModels") : section === "review" ? td("profile") : t("internalMainCopy.integrations");
	return <div className="space-y-6">
		<SettingsPageHeader title={title} />
		<div className="divide-y border-y border-border/70">
			{data.catalogProviders.map((provider) => <div key={provider.provider_slug} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
				<span>{provider.name ?? provider.provider_slug}</span>
				<span className="text-muted-foreground">{(provider.provider_approval_status ?? provider.provider_review_status) ? translatedStatus("reviewStatus", (provider.provider_approval_status ?? provider.provider_review_status)!) : td("statusUnavailable")}</span>
			</div>)}
		</div>
		{section === "models" && <ProviderCatalogManager providers={data.catalogProviders} />}
		{section === "review" && <div className="grid gap-5 lg:grid-cols-2">{data.catalogProviders.map((provider) => {
			const application = data.submissions.find((submission) => submission.provider_slug === provider.provider_slug);
			return <section key={provider.provider_slug} className="space-y-4 rounded-xl border p-5"><h2 className="text-lg font-semibold">{provider.name || provider.provider_slug}</h2><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{td("providerId")}</dt><dd className="mt-1 font-mono text-xs">{provider.provider_slug}</dd></div><div><dt className="text-muted-foreground">{td("approval")}</dt><dd className="mt-1">{(provider.provider_approval_status ?? provider.provider_review_status) ? translatedStatus("reviewStatus", (provider.provider_approval_status ?? provider.provider_review_status)!) : td("statusUnavailable")}</dd></div><div><dt className="text-muted-foreground">{td("website")}</dt><dd className="mt-1 break-all">{application?.website_url || td("notSet")}</dd></div><div><dt className="text-muted-foreground">{td("access")}</dt><dd className="mt-1">{provider.role} · {provider.verified_at ? new Date(provider.verified_at).toLocaleDateString(locale) : td("notVerified")}</dd></div></dl></section>;
		})}</div>}
		{section === "integrations" && <div className="space-y-5">{data.syncSources.map((source) => <ProviderIntegrationSummary key={source.provider_slug} source={source} canManage={data.isAdmin || data.linkedProviders.some((link) => link.provider_slug === source.provider_slug && ["owner", "admin"].includes(link.role))} />)}</div>}
	</div>;
}
