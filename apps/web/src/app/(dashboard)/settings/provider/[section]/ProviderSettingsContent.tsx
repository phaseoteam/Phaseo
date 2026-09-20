"use client";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ProviderCatalogManager from "@/components/(gateway)/settings/account/ProviderCatalogManager";
import ProviderWebhookSettings from "@/components/(gateway)/settings/account/ProviderWebhookSettings";
export default function ProviderSettingsContent({ section }: { section: string }) {
	return <PrivateSettingsQuery<SettingsProviderOnboardingInitialData> path="/api/account/settings/provider-onboarding" workspace={false}>{(data) => <ProviderSettingsView section={section} data={data} />}</PrivateSettingsQuery>;
}

function ProviderSettingsView({ section, data }: { section: string; data: SettingsProviderOnboardingInitialData }) {
	if (!["models", "review", "integrations"].includes(section)) notFound();
	if (!data.signedIn) redirect("/sign-in");
	if (!data.catalogProviders.length) redirect("/settings/account/providers");
	const title = section === "models" ? "Your Models" : section === "review" ? "Provider Review" : "Integrations";
	const latestReviewRevisions = data.reviewRevisions.filter(
		(revision, index, revisions) =>
			index === revisions.findIndex((candidate) => candidate.provider_slug === revision.provider_slug),
	);
	return <div className="space-y-6">
		<SettingsPageHeader title={title} />
		<div className="divide-y border-y border-border/70">
			{data.catalogProviders.map((provider) => <div key={provider.provider_slug} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
				<span>{provider.name ?? provider.provider_slug}</span>
				<span className="text-muted-foreground">{provider.operatingStatus ?? "Status unavailable"}</span>
			</div>)}
		</div>
		{section === "models" && <ProviderCatalogManager providers={data.catalogProviders} />}
		{section === "review" && <div className="space-y-4">
			<p className="text-sm text-muted-foreground">Review approval and endpoint checks are separate from your release schedule.</p>
			{latestReviewRevisions.length ? latestReviewRevisions.map((revision) => <section key={revision.id} className="divide-y rounded-lg border">
				<div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"><span>{revision.provider_slug}</span><span className="capitalize text-muted-foreground">{revision.review_status.replaceAll("_", " ")}</span></div>
				{revision.models.map((model) => <div key={model.model_slug} className="space-y-1 px-4 py-3 text-sm">
					<div className="flex flex-wrap justify-between gap-2"><span>{model.name}</span><span className="capitalize">{model.decision.replaceAll("_", " ")}</span></div>
					<p className="font-mono text-xs text-muted-foreground">{model.model_slug}</p>
					{model.decision_reason && <p className="text-muted-foreground">{model.decision_reason}</p>}
				</div>)}
			</section>) : <p className="text-sm text-muted-foreground">No catalog revisions to review yet.</p>}
		</div>}
		{section === "integrations" && <div className="space-y-4 text-sm">
			<p className="text-muted-foreground">The UI and authenticated catalog API read and write the same database document. Signed webhook events request a sync; they do not replace the document.</p>
			{data.syncSources.map((source) => <section key={source.provider_slug} className="space-y-3 border-y border-border/70 py-4">
				<h2 className="font-medium">{source.provider_slug}</h2>
				<p className="text-muted-foreground">Catalog API · GET / PUT</p>
				<code className="block break-all text-xs">/api/account/settings/provider-onboarding/catalog/{source.provider_slug}</code>
				<p className="text-muted-foreground">Signed webhook · POST</p>
				{data.linkedProviders.some((link) => link.provider_slug === source.provider_slug && ["owner", "admin"].includes(link.role)) ? <ProviderWebhookSettings providerSlug={source.provider_slug} webhookUrl={source.webhookUrl} configured={source.webhookConfigured} /> : <p className="text-xs text-muted-foreground">Only provider owners and admins can manage the signing secret.</p>}
				{source.last_error && <p role="alert" className="text-destructive">{source.last_error}</p>}
			</section>)}
			<Link href="/settings/account/providers" className="underline underline-offset-4">Provider connections and webhook setup</Link>
		</div>}
	</div>;
}
