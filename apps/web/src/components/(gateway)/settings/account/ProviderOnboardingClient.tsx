"use client";

import * as React from "react";
import {
	ArrowRight,
	BadgeCheck,
	Check,
	ChevronRight,
	CircleAlert,
	CloudDownload,
	Globe2,
	FileJson2,
	Link2,
	LockKeyhole,
	RefreshCw,
	Send,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { previewProviderCatalogAction, rotateProviderCatalogWebhookAction, startProviderClaimAction, submitProviderOnboardingAction, type ProviderCatalogPreview } from "@/app/(dashboard)/settings/account/providers/actions";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";

type Props = { initialData: SettingsProviderOnboardingInitialData };

function slugify(value: string): string {
	return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function formatDate(value: string | null, locale: string, notYet: string, unknown: string): string {
	if (!value) return notYet;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? unknown : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function initialOf(name: string): string {
	return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "P";
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" }) {
	return <span className={cn(
		"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
		tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
		tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
		tone === "neutral" && "border-border/70 bg-muted/40 text-muted-foreground",
	)}>{children}</span>;
}

function PreviewModel({ model }: { model: ProviderCatalogPreview["models"][number] }) {
	const t = useTranslations("SettingsUI");
	return <div className="group flex items-start gap-3 border-b border-border/60 px-4 py-3.5 last:border-0">
		<div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-foreground/[0.1]">AI</div>
		<div className="min-w-0 flex-1">
			<div className="flex flex-wrap items-center gap-2">
				<p className="truncate text-sm font-medium">{model.name}</p>
				<StatusPill tone="success"><Check className="size-3" /> {t("identity.valid" as never)}</StatusPill>
			</div>
			<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{model.id}</p>
			<div className="mt-2 flex flex-wrap gap-1.5">
				{model.capabilities.slice(0, 3).map((capability) => <span key={capability.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{capability.id}</span>)}
				{model.inputModalities.map((modality) => <span key={`in-${modality}`} className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{t("identity.inputPrefix" as never)}: {modality}</span>)}
			</div>
		</div>
	</div>;
}

export default function ProviderOnboardingClient({ initialData }: Props) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const s = (key: string) => t(`strings.${key}` as never);
	const date = (value: string | null) => formatDate(value, locale, t("identity.notYet" as never), t("identity.unknown" as never));
	const status = (group: string, value: string) => {
		const known = new Set([
			"pending", "in_progress", "needs_changes", "partially_approved", "approved", "rejected", "failed", "cancelled",
			"ready", "not_ready", "degraded", "deprecated", "retired", "not_projected", "staged", "probe_passed", "enabled",
			"exact", "alias", "new_model", "submitted", "published", "active", "owner", "admin", "member", "reviewer",
		]);
		const key = known.has(value) ? value : "other";
		return t(`identity.${group}.${key}` as never);
	};
	const [providerName, setProviderName] = React.useState("");
	const [providerSlug, setProviderSlug] = React.useState("");
	const [slugTouched, setSlugTouched] = React.useState(false);
	const [websiteUrl, setWebsiteUrl] = React.useState("");
	const [logoUrl, setLogoUrl] = React.useState("");
	const [catalogUrl, setCatalogUrl] = React.useState("");
	const [preview, setPreview] = React.useState<ProviderCatalogPreview | null>(null);
	const [checking, setChecking] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);
	const [claim, setClaim] = React.useState<{ challengeId: string; token: string; verificationUrl: string } | null>(null);
	const [startingClaim, setStartingClaim] = React.useState(false);
	const [submitted, setSubmitted] = React.useState<{ providerSlug: string; modelCount: number; webhookUrl: string; webhookSecret: string | null } | null>(null);

	function updateName(value: string) {
		setProviderName(value);
		if (!slugTouched) setProviderSlug(slugify(value));
	}

	async function checkCatalog() {
		if (!catalogUrl.trim()) return toast.error(s("Add your catalog URL first."));
		setChecking(true);
		try {
			const result = await previewProviderCatalogAction(catalogUrl.trim());
			setPreview(result.preview);
			if (result.preview.valid) toast.success(`${s("Catalog checked")} · ${result.preview.modelCount} ${s("models found")}`);
			else toast.error(`${result.preview.issues.length} ${s(result.preview.issues.length === 1 ? "catalog issue found" : "catalog issues found")}`);
		} catch (error) {
			setPreview(null);
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not check catalog")));
		} finally { setChecking(false); }
	}

	async function submit() {
		if (!preview?.valid) return toast.error(s("Check a valid catalog before submitting."));
		setSubmitting(true);
		try {
			const result = await submitProviderOnboardingAction({ providerName, providerSlug, websiteUrl, logoUrl, catalogUrl, claimChallengeId: claim?.challengeId });
			setSubmitted({ providerSlug: result.submission.provider_slug, modelCount: result.submission.model_count, webhookUrl: result.catalogSync.webhookUrl, webhookSecret: result.catalogSync.webhookSecret });
			toast.success(s("Provider profile submitted"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not submit provider")));
		} finally { setSubmitting(false); }
	}

	async function startClaim() {
		if (!providerSlug.trim() || !websiteUrl.trim()) return toast.error(s("Enter the provider slug and website first."));
		setStartingClaim(true);
		try { const result = await startProviderClaimAction(providerSlug, websiteUrl); setClaim(result); toast.success(s("Ownership proof created")); }
		catch (error) { toast.error(localizedSettingsError(error, t, "Action failed", s("Could not create ownership proof"))); }
		finally { setStartingClaim(false); }
	}

	async function rotateWebhook() {
		if (!submitted) return;
		try {
			const result = await rotateProviderCatalogWebhookAction(submitted.providerSlug);
			setSubmitted({ ...submitted, webhookUrl: result.webhookUrl, webhookSecret: result.webhookSecret });
			toast.success(s("Webhook signing secret rotated"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not rotate webhook secret")));
		}
	}

	const profileReady = Boolean(providerName.trim() && providerSlug.trim() && websiteUrl.trim() && catalogUrl.trim());

	return <div className="space-y-7">
		<section className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-[#101412] px-5 py-6 text-white shadow-[0_18px_55px_-28px_rgba(16,24,20,0.55)] sm:px-7 sm:py-8">
			<div className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-emerald-300/15 blur-3xl" />
			<div className="pointer-events-none absolute -bottom-40 left-1/3 size-80 rounded-full bg-lime-200/10 blur-3xl" />
			<div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)] lg:items-end">
				<div className="max-w-xl">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] text-emerald-100"><Sparkles className="size-3.5" /> {s("Provider program")}</div>
					<h2 className="max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">{s("Bring your models to the route.")}</h2>
					<p className="mt-3 max-w-lg text-sm leading-6 text-white/65">{s("Connect a live catalog once. We’ll validate the shape, preview what we found, and keep your account linked to the provider profile.")}</p>
					{initialData.isAdmin ? <a href="/settings/internal/provider-review" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">{t("identity.openReviewQueue" as never)} <ArrowRight className="size-3.5" /></a> : null}
				</div>
				<div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4 lg:border-t-0 lg:border-l lg:pl-6">
					{[["01", t("identity.profile" as never)], ["02", t("identity.catalog" as never)], ["03", t("identity.submit" as never)]].map(([number, label], index) => <div key={number} className="space-y-1"><div className={cn("font-mono text-[10px]", index === 0 ? "text-emerald-200" : "text-white/35")}>{number}</div><div className="text-xs text-white/70">{label}</div></div>)}
				</div>
			</div>
		</section>

	{submitted ? <Card className="overflow-hidden border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"><CardContent className="space-y-4 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><BadgeCheck className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-medium">{t("identity.submittedHeading", { provider: submitted.providerSlug } as never)}</p><p className="mt-1 text-sm text-muted-foreground">{t("identity.submittedSummary", { count: submitted.modelCount } as never)}</p></div><Button variant="outline" onClick={() => setSubmitted(null)}>{t("identity.submitAnother" as never)}</Button></div><div className="rounded-xl border border-emerald-200/70 bg-white/60 p-4 dark:border-emerald-900/50 dark:bg-black/10"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{t("identity.webhookDelivery" as never)}</p><StatusPill tone="success">{t("identity.webhookPolling" as never)}</StatusPill></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("identity.webhookInstructions" as never)}</p><code className="mt-3 block overflow-x-auto rounded-lg bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookUrl}</code>{submitted.webhookSecret ? <><p className="mt-3 text-xs font-medium">{t("identity.saveSigningSecret" as never)}</p><code className="mt-1 block overflow-x-auto rounded-lg bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookSecret}</code></> : <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-xs text-muted-foreground">{t("identity.signingSecretExists" as never)}</p><Button type="button" size="sm" variant="outline" onClick={() => void rotateWebhook()}><RefreshCw className="mr-1.5 size-3.5" /> {t("identity.rotateSecret" as never)}</Button></div>}<p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t.rich("identity.signatureInstructions" as never, { payload: (chunks: React.ReactNode) => <code className="rounded bg-black/[0.06] px-1 dark:bg-white/[0.06]">{chunks}</code>, timestamp: (chunks: React.ReactNode) => <code className="rounded bg-black/[0.06] px-1 dark:bg-white/[0.06]">{chunks}</code>, signature: (chunks: React.ReactNode) => <code className="rounded bg-black/[0.06] px-1 dark:bg-white/[0.06]">{chunks}</code>, hexPlaceholder: <>&lt;hex&gt;</> } as never)}</p></div></CardContent></Card> : null}

		<div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
			<Card className="border-border/70 bg-background/70">
				<CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{t("identity.providerProfile" as never)}</CardTitle><CardDescription className="mt-1">{t("identity.providerProfileDescription" as never)}</CardDescription></div><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-sm font-semibold text-muted-foreground">{initialOf(providerName)}</div></div></CardHeader>
				<CardContent className="space-y-5">
					<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-name">{t("identity.providerName" as never)}</Label><Input id="provider-name" value={providerName} onChange={(event) => updateName(event.target.value)} placeholder={t("identity.providerNamePlaceholder" as never)} autoComplete="organization" /></div><div className="space-y-2"><Label htmlFor="provider-slug">{t("identity.providerSlug" as never)}</Label><Input id="provider-slug" value={providerSlug} onChange={(event) => { setClaim(null); setSlugTouched(true); setProviderSlug(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-")); }} placeholder="acme-inference" /><p className="text-[11px] text-muted-foreground">{t("identity.providerSlugDescription" as never)}</p></div><div className="space-y-2"><Label htmlFor="provider-website">{t("identity.website" as never)}</Label><Input id="provider-website" type="url" value={websiteUrl} onChange={(event) => { setClaim(null); setWebsiteUrl(event.target.value); }} placeholder="https://acme.example" autoComplete="url" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-logo">{t("identity.logoUrl" as never)} <span className="font-normal text-muted-foreground">({s("optional")})</span></Label><Input id="provider-logo" type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://acme.example/brand/logo.svg" /><p className="text-[11px] text-muted-foreground">{t("identity.logoUrlDescription" as never)}</p></div></div>
					<div className="rounded-xl border border-border/60 bg-muted/25 p-3.5"><div className="flex gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p className="text-xs leading-5 text-muted-foreground">{t("identity.accountControlNotice" as never)}</p></div></div>
					<div className="space-y-3 rounded-xl border border-border/60 p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{t("identity.claimExistingProfile" as never)}</p><p className="mt-1 text-xs text-muted-foreground">{t("identity.claimExistingHelp" as never)}</p></div><Button type="button" size="sm" variant="outline" disabled={startingClaim || !providerSlug || !websiteUrl} onClick={() => void startClaim()}>{startingClaim ? t("identity.creatingProof" as never) : t("identity.createProof" as never)}</Button></div>{claim ? <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs"><p>{t("identity.publishTokenAt" as never)}</p><code className="block overflow-x-auto">{claim.verificationUrl}</code><code className="block overflow-x-auto font-semibold">{claim.token}</code><p className="text-muted-foreground">{t("identity.claimSubmitHint" as never)}</p></div> : null}</div>
				</CardContent>
			</Card>

			<Card className="border-border/70 bg-background/70">
				<CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{t("identity.liveCatalog" as never)}</CardTitle><CardDescription className="mt-1">{t("identity.liveCatalogDescription" as never)}</CardDescription></div><CloudDownload className="size-5 text-muted-foreground" /></div></CardHeader>
				<CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="provider-catalog">{t("identity.modelsListUrl" as never)}</Label><div className="flex gap-2"><Input id="provider-catalog" type="url" value={catalogUrl} onChange={(event) => { setCatalogUrl(event.target.value); setPreview(null); }} placeholder="https://acme.example/.well-known/phaseo/models.json" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void checkCatalog(); } }} /><Button type="button" variant="outline" size="icon" onClick={() => void checkCatalog()} disabled={checking || !catalogUrl.trim()} aria-label={t("identity.checkCatalog" as never)}>{checking ? <RefreshCw className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div><p className="text-[11px] leading-5 text-muted-foreground">{t("identity.catalogUrlRequirements" as never)}</p><div className="flex flex-wrap gap-3 text-xs"><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.schemaUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> JSON Schema</a><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.openApiUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> Webhook OpenAPI</a></div></div>
					<div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-4"><div className="flex gap-3"><Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-medium">{t("identity.whatWeCheck" as never)}</p><p className="text-xs leading-5 text-muted-foreground">{s("Model IDs, endpoint capabilities, modalities, parameters, limits, and a safe response size. A successful preview does not turn traffic on.")}</p></div></div></div>
					{preview ? <div className={cn("rounded-xl border p-3.5", preview.valid ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20")}><div className="flex items-start gap-3"><div className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", preview.valid ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>{preview.valid ? <Check className="size-4" /> : <CircleAlert className="size-4" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{preview.valid ? t("identity.previewReady", { count: preview.modelCount } as never) : t("identity.catalogNeedsFixes" as never)}</p>{preview.valid ? <p className="mt-1 text-xs text-muted-foreground">{t("identity.previewValidDescription" as never)}</p> : <div className="mt-2 space-y-1">{preview.issues.slice(0, 4).map((issue) => <p key={`${issue.path}:${issue.message}`} className="text-xs text-amber-800 dark:text-amber-200"><span className="font-mono">{issue.path}</span> — {issue.message}</p>)}</div>}</div></div></div> : null}
					<div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> {t("identity.noPaymentRequired" as never)}</div><Button type="button" onClick={() => void submit()} disabled={!profileReady || !preview?.valid || submitting}>{submitting ? s("Submitting…") : t("identity.submit" as never)}<Send className="ml-1 size-3.5" /></Button></div>
				</CardContent>
			</Card>
		</div>

		{preview?.valid ? <Card className="overflow-hidden border-border/70"><CardHeader className="flex flex-row items-end justify-between gap-4 border-b border-border/60"><div><CardTitle>{t("identity.catalogPreview" as never)}</CardTitle><CardDescription className="mt-1">{s("A sample of what Phaseo received from your URL.")}</CardDescription></div><span className="font-mono text-[11px] text-muted-foreground">{preview.truncated ? t("identity.first100Shown" as never) : t("identity.itemsShown", { count: preview.models.length } as never)}</span></CardHeader><CardContent className="p-0"><div className="grid max-h-[32rem] overflow-y-auto sm:grid-cols-2">{preview.models.map((model) => <PreviewModel key={model.id} model={model} />)}</div></CardContent></Card> : null}

		{initialData.reviewRevisions.length ? <section className="space-y-3"><div><h2 className="font-heading text-base font-medium">{t("identity.reviewOutcomes" as never)}</h2><p className="mt-1 text-sm text-muted-foreground">{t("identity.reviewOutcomesDescription" as never)}</p></div><div className="space-y-3">{initialData.reviewRevisions.slice(0, 5).map((revision) => <Card key={revision.id} className="border-border/70"><CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 py-4"><div><CardTitle className="text-sm">{t("identity.catalogRevision" as never)}</CardTitle><CardDescription className="mt-1">{t("identity.modelCount", { count: revision.model_count ?? revision.models.length } as never)} · {date(revision.created_at)}</CardDescription></div><StatusPill tone={revision.review_status === "approved" ? "success" : revision.review_status === "pending" || revision.review_status === "in_progress" || revision.review_status === "needs_changes" ? "warning" : "neutral"}>{status("reviewStatus", revision.review_status)}</StatusPill></CardHeader><CardContent className="divide-y divide-border/60 p-0">{revision.models.slice(0, 100).map((model) => <div key={`${revision.id}:${model.model_slug}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{model.name}</p><p className="truncate font-mono text-[11px] text-muted-foreground">{model.model_slug} · {model.provider_model_slug}</p><p className="mt-1 text-[11px] text-muted-foreground">{model.match_type === "new_model" ? t("identity.newCanonicalModel" as never) : model.match_type ? t("identity.matchedBy", { matchType: status("matchType", model.match_type) } as never) : t("identity.matching" as never)} · {status("availability", model.availability)} · {t("identity.routeStatusLabel" as never)} {status("routeStatus", model.route_projection_status)}</p>{model.decision_reason ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{model.decision_reason}</p> : null}</div><StatusPill tone={model.decision === "approved" ? "success" : model.decision === "pending" || model.decision === "needs_changes" ? "warning" : "neutral"}>{status("decision", model.decision)}</StatusPill></div>)}</CardContent></Card>)}</div></section> : null}

		{initialData.events.length ? <section className="space-y-3"><div><h2 className="font-heading text-base font-medium">{t("identity.notifications" as never)}</h2><p className="mt-1 text-sm text-muted-foreground">{t("identity.notificationsDescription" as never)}</p></div><div className="overflow-hidden rounded-xl border border-border/70">{initialData.events.slice(0, 10).map((event) => <div key={event.id} className="border-b border-border/60 px-4 py-3 last:border-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{event.title}</p><span className="text-[11px] text-muted-foreground">{date(event.created_at)}</span></div><p className="mt-1 text-xs text-muted-foreground">{event.message}</p></div>)}</div></section> : null}

		<section className="space-y-3"><div className="flex items-end justify-between gap-4"><div><h2 className="font-heading text-base font-medium">{t("identity.yourProviderActivity" as never)}</h2><p className="mt-1 text-sm text-muted-foreground">{t("identity.providerActivityDescription" as never)}</p></div></div>{initialData.linkedProviders.length || initialData.submissions.length ? <div className="overflow-hidden rounded-xl border border-border/70">{initialData.linkedProviders.map((provider) => <div key={provider.provider_slug} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><BadgeCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{provider.provider_slug}</p><p className="text-xs text-muted-foreground">{t("identity.linkedAs", { role: status("role", provider.role) } as never)} · {provider.status === "active" ? t("identity.verifiedOn", { date: date(provider.verified_at) } as never) : t("identity.ownershipPending" as never)}</p></div><StatusPill tone={provider.status === "active" ? "success" : "warning"}>{provider.status === "active" ? t("identity.active" as never) : status("reviewStatus", "pending")}</StatusPill></div>)}{initialData.submissions.map((submission) => <div key={submission.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Send className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{submission.provider_name}</p><p className="truncate text-xs text-muted-foreground">{t("identity.modelCount", { count: submission.model_count } as never)} · {t("identity.submittedOn", { date: date(submission.submitted_at ?? submission.created_at) } as never)}</p></div><StatusPill tone={submission.status === "published" ? "success" : "warning"}>{status("submissionStatus", submission.status)}</StatusPill><ChevronRight className="size-4 text-muted-foreground" /></div>)}</div> : <div className="rounded-xl border border-dashed border-border/80 px-6 py-10 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-muted/60"><Globe2 className="size-5 text-muted-foreground" /></div><p className="text-sm font-medium">{t("identity.noProviderActivity" as never)}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("identity.noProviderActivityDescription" as never)}</p></div>}</section>
	</div>;
}
