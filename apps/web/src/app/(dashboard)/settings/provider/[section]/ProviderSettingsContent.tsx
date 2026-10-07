"use client";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { Link, redirect } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { localizedProviderCatalogMessage } from "@/i18n/provider-catalog-messages";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useLocale } from "next-intl";
import ProviderCatalogManager from "@/components/(gateway)/settings/account/ProviderCatalogManager";
import ProviderWebhookSettings from "@/components/(gateway)/settings/account/ProviderWebhookSettings";
export default function ProviderSettingsContent({ section }: { section: string }) {
	return <PrivateSettingsQuery<SettingsProviderOnboardingInitialData> path="/api/account/settings/provider-onboarding" workspace={false}>{(data) => <ProviderSettingsView section={section} data={data} />}</PrivateSettingsQuery>;
}

function ProviderSettingsView({ section, data }: { section: string; data: SettingsProviderOnboardingInitialData }) {
	const t = useTranslations("SettingsUI");
 const locale = useLocale();
 const translatedStatus = (group: string, value: string) => { const key = `identity.${group}.${value}`; return t.has(key as never) ? t(key as never) : t(`identity.${group}.other` as never); };
	if (!["models", "review", "integrations"].includes(section)) notFound();
	if (!data.signedIn) redirect({ href: "/sign-in", locale });
	if (!data.catalogProviders.length) redirect({ href: "/settings/account/providers", locale });
	const title = section === "models" ? t("internalMainCopy.yourModels") : section === "review" ? t("internalMainCopy.providerReview") : t("internalMainCopy.integrations");
	const latestReviewRevisions = data.reviewRevisions.filter(
		(revision, index, revisions) =>
			index === revisions.findIndex((candidate) => candidate.provider_slug === revision.provider_slug),
	);
	return <div className="space-y-6">
		<SettingsPageHeader title={title} />
		<div className="divide-y border-y border-border/70">
			{data.catalogProviders.map((provider) => <div key={provider.provider_slug} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
				<span>{provider.name ?? provider.provider_slug}</span>
				<span className="text-muted-foreground">{provider.operatingStatus ? translatedStatus("availability", provider.operatingStatus) : t("identity.availability.other")}</span>
			</div>)}
		</div>
		{section === "models" && <ProviderCatalogManager providers={data.catalogProviders} />}
		{section === "models" && latestReviewRevisions.map((revision) => {
			const blockedModels = revision.models.filter((model) => ["needs_changes", "rejected"].includes(model.decision));
			return blockedModels.length ? <section key={revision.id} className="divide-y rounded-lg border">
				<h2 className="px-4 py-3 text-sm font-medium">{revision.provider_slug} · {translatedStatus("reviewStatus", "needs_changes")}</h2>
				{blockedModels.map((model) => <div key={model.model_slug} className="space-y-1 px-4 py-3 text-sm">
					<p>{model.name}</p>
					<p className="font-mono text-xs text-muted-foreground">{model.model_slug}</p>
					{model.decision_reason && <p className="text-destructive">{model.decision_reason}</p>}
				</div>)}
			</section> : null;
		})}
		{section === "review" && <div className="space-y-4">
			<p className="text-sm text-muted-foreground">{t("internalMainCopy.scheduleHelp")}</p>
			{latestReviewRevisions.length ? latestReviewRevisions.map((revision) => <section key={revision.id} className="divide-y rounded-lg border">
				<div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"><span>{revision.provider_slug}</span><span className="capitalize text-muted-foreground">{translatedStatus("reviewStatus", revision.review_status)}</span></div>
				{revision.models.map((model) => <div key={model.model_slug} className="space-y-1 px-4 py-3 text-sm">
					<div className="flex flex-wrap justify-between gap-2"><span>{model.name}</span><span className="capitalize">{translatedStatus("decision", model.decision)}</span></div>
					<p className="font-mono text-xs text-muted-foreground">{model.model_slug}</p>
					{model.decision_reason && <p className="text-muted-foreground">{model.decision_reason === "Automatically matched to an existing canonical model." ? localizedProviderCatalogMessage(model.decision_reason, t) : model.decision_reason}</p>}
				</div>)}
			</section>) : <p className="text-sm text-muted-foreground">{t("internalMainCopy.noRevisions")}</p>}
		</div>}
		{section === "integrations" && <div className="space-y-4 text-sm">
			<p className="text-muted-foreground">{t("internalMainCopy.documentHelp")}</p>
			{data.syncSources.map((source) => <section key={source.provider_slug} className="space-y-3 border-y border-border/70 py-4">
				<h2 className="font-medium">{source.provider_slug}</h2>
				<p className="text-muted-foreground">{t("internalMainCopy.catalogApi")}</p>
				<code className="block break-all text-xs">/api/account/settings/provider-onboarding/catalog/{source.provider_slug}</code>
				<p className="text-muted-foreground">{t("internalMainCopy.signedWebhook")}</p>
				{data.linkedProviders.some((link) => link.provider_slug === source.provider_slug && ["owner", "admin"].includes(link.role)) ? <ProviderWebhookSettings providerSlug={source.provider_slug} webhookUrl={source.webhookUrl} configured={source.webhookConfigured} /> : <p className="text-xs text-muted-foreground">{t("internalMainCopy.ownerHelp")}</p>}
				{source.last_error && <p role="alert" className="text-destructive">{localizedSettingsError(source.last_error, t, "Action failed")}</p>}
			</section>)}
			<Link href="/settings/account/providers" className="underline underline-offset-4">{t("internalMainCopy.connections")}</Link>
		</div>}
	</div>;
}
