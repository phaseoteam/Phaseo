"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAccountQueries } from "@/lib/query/invalidation";
import {
	ArrowRight,
	BadgeCheck,
	Check,
	ChevronDown,
	ChevronRight,
	CircleAlert,
	Globe2,
	FileJson2,
	Link2,
	RefreshCw,
	Send,
	ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { localizedProviderCatalogMessage, localizedProviderEvent } from "@/i18n/provider-catalog-messages";
import { localizedSettingsError } from "@/i18n/error-messages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { activateProviderAccountAction, rotateProviderCatalogWebhookAction, startProviderClaimAction, type ProviderCatalogPreview } from "@/app/(dashboard)/settings/account/providers/actions";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import ProviderCatalogManager from "./ProviderCatalogManager";

type Props = { initialData: SettingsProviderOnboardingInitialData };

function slugify(value: string): string {
	return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function formatDate(value: string | null, locale: string, notYet: string, unknown: string): string {
	if (!value) return notYet;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? unknown : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}



function applicationStatusTone(status: string): "neutral" | "success" | "warning" {
	if (status === "approved" || status === "published") return "success";
	if (status === "rejected") return "neutral";
	return "warning";
}

const SUGGESTED_TIME_ZONES = [
	"UTC",
	"Europe/London",
	"Europe/Berlin",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"Asia/Kolkata",
	"Asia/Singapore",
	"Asia/Tokyo",
	"Australia/Sydney",
	"Pacific/Auckland",
];

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

function isTimeZone(value: string): boolean {
	if (!value.trim()) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value.trim() }).format();
		return true;
	} catch {
		return false;
	}
}

function formatTimestamp(value: string | null, timeZone: string, locale: string): { local: string; utc: string } | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return {
		local: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date),
		utc: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date),
	};
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" }) {
	return <span className={cn(
		"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
		tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
		tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
		tone === "neutral" && "border-border/70 bg-muted/40 text-muted-foreground",
	)}>{children}</span>;
}

function PreviewModel({ model, displayTimeZone }: { model: ProviderCatalogPreview["models"][number]; displayTimeZone: string }) {
 const tx = useTranslations();

	const t = useTranslations("SettingsUI");
 const locale = useLocale();
 const [expanded, setExpanded] = React.useState(false);
 const modalityLabel = (value: string) => {
  const key = `Catalogue.modelDetail.sections.${value}`;
  return tx.has(key as never) ? tx(key as never) : value;
 };
	const availabilityKey = `identity.availability.${model.availability}`;
	const availabilityLabel = t.has(availabilityKey as never) ? t(availabilityKey as never) : t("identity.availability.other");
	const availabilityTone = model.availability === "ready" ? "success" : model.availability === "degraded" ? "warning" : "neutral";
	const formatValue = (value: number | null) => value === null ? tx("SettingsUI.strings.Not supplied" as never) : new Intl.NumberFormat(locale, { notation: "compact" }).format(value);
	const lifecycleTimestamp = (value: string | null) => {
		const formatted = formatTimestamp(value, displayTimeZone, locale);
		return formatted ? <><p>{formatted.local} <span className="text-muted-foreground">({displayTimeZone})</span></p><p className="mt-0.5 text-[11px] text-muted-foreground">{formatted.utc} {tx("SettingsUI.strings.UTC" as never)}</p></> : <p>{tx("SettingsUI.strings.Not supplied" as never)}</p>;
	};

	return <div className="border-b border-border/60 last:border-0">
		<div className="group flex items-start gap-3 px-4 py-3.5">
			<div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-foreground/[0.1]">{t("identity.current.ai")}</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate text-sm font-medium">{model.name}</p>
					<StatusPill tone="success"><Check className="size-3" /> {tx("SettingsUI.identity.valid" as never)}</StatusPill>
					<StatusPill tone={availabilityTone as "success" | "warning" | "neutral"}>{availabilityLabel}</StatusPill>
				</div>
				<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{model.id}</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{model.capabilities.slice(0, 4).map((capability) => <span key={capability.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{capability.id}</span>)}
					{model.inputModalities.map((modality) => <span key={`in-${modality}`} className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{t("identity.current.inputModality", { modality: modalityLabel(modality) })}</span>)}
				</div>
			</div>
			<Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? t("identity.current.hideDetails") : tx("Catalogue.compare.viewDetail" as never)}<ChevronDown className={cn("ml-1 size-3.5 transition-transform", expanded && "rotate-180")} /></Button>
		</div>
		{expanded ? <div className="space-y-4 bg-muted/20 px-4 pb-4 pl-15 text-xs">
			{model.description ? <p className="max-w-3xl leading-5 text-muted-foreground">{model.description}</p> : <p className="text-muted-foreground">{t("identity.current.noDescription")}</p>}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div><p className="font-medium">{tx("Common.ui.modelEditor.providerModel" as never)}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{model.providerModelSlug}</p></div>
				<div><p className="font-medium">{tx("Catalogue.compare.contextWindow" as never)}</p><p className="mt-1 text-muted-foreground">{formatValue(model.contextLength)} {tx("Common.ui.apps.tokens" as never)}</p></div>
				<div><p className="font-medium">{t("identity.current.maxOutput")}</p><p className="mt-1 text-muted-foreground">{formatValue(model.maxOutputTokens)} {tx("Common.ui.apps.tokens" as never)}</p></div>
				<div><p className="font-medium">{tx("Common.ui.select.output" as never)}</p><p className="mt-1 text-muted-foreground">{model.outputModalities.map(modalityLabel).join(", ") || t("identity.current.notSupplied")}</p></div>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<div><p className="font-medium">{t("identity.current.availableFrom")}</p><div className="mt-1 text-muted-foreground">{lifecycleTimestamp(model.availableFrom)}</div></div>
				<div><p className="font-medium">{tx("SettingsUI.identity.availability.deprecated" as never)}</p><div className="mt-1 text-muted-foreground">{lifecycleTimestamp(model.deprecatedAt)}</div></div>
				<div><p className="font-medium">{t("identity.current.shutdown")}</p><div className="mt-1 text-muted-foreground">{lifecycleTimestamp(model.shutdownAt)}</div></div>
			</div>
			<div><p className="font-medium">{t("identity.current.capabilities")}</p><div className="mt-2 flex flex-wrap gap-2">{model.capabilities.map((capability) => <span key={capability.id} className="rounded-md border border-border/60 bg-background px-2 py-1 text-muted-foreground">{capability.id}{capability.parameters.length ? ` · ${capability.parameters.join(", ")}` : ""}</span>)}</div></div>
			<div><p className="font-medium">{t("identity.current.pricingMeters")}</p>{model.pricing.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{model.pricing.map((price, index) => <div key={`${price.meterKey}:${index}`} className="rounded-lg border border-border/60 bg-background px-3 py-2"><p className="font-medium">{price.displayLabel}</p><p className="mt-1 text-muted-foreground">{price.meterKey} · {price.modality}{price.direction ? ` · ${price.direction}` : ""}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{price.displayUnit} · {price.unit}</p>{price.conditions?.length ? <p className="mt-1 text-amber-700 dark:text-amber-300">{t("identity.current.pricingReview", { conditions: price.conditions.map((condition) => `${condition.path} ${condition.op} ${Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value)}`).join("; ") })}</p> : null}</div>)}</div> : <p className="mt-1 text-muted-foreground">{t("identity.current.noPricingMeters")}</p>}</div>
		</div> : null}
	</div>;
}

export default function ProviderOnboardingClient({ initialData }: Props) {
 const tx = useTranslations();

	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const s = (key: string) => t(settingsStringKey(key) as never);
	const date = (value: string | null) => formatDate(value, locale, t("identity.notYet" as never), t("identity.unknown" as never));
	const status = (group: string, value: string) => {
		const key = `identity.${group}.${value}`;
		return t.has(key as never) ? t(key as never) : t(`identity.${group}.other` as never);
	};
	const applicationStatusLabel = (value: string) => {
		if (value === "setup" || value === "awaiting_approval") return t("identity.current.inReview");
		if (value === "needs_changes") return t("identity.current.changesRequested");
		if (value === "paused") return t("providerReviewCopy.current.statusPaused");
		if (value === "published") return status("submissionStatus", value);
		return status("reviewStatus", value);
	};
	const router = useRouter();
	const queryClient = useQueryClient();
	const [showConnection, setShowConnection] = React.useState(false);
	const [applicationType, setApplicationType] = React.useState<"new" | "claim">("new");
	const [providerName, setProviderName] = React.useState("");
	const [providerSlug, setProviderSlug] = React.useState("");
	const [slugTouched, setSlugTouched] = React.useState(false);
	const [websiteUrl, setWebsiteUrl] = React.useState("");
	const [logoUrl, setLogoUrl] = React.useState("");
	const [catalogUrl, setCatalogUrl] = React.useState("");
	const [catalogMode, setCatalogMode] = React.useState<"managed" | "remote">("managed");
	const [preview, setPreview] = React.useState<ProviderCatalogPreview | null>(null);
	const [checking, setChecking] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);
	const [claim, setClaim] = React.useState<{ challengeId: string; token: string; verificationUrl: string } | null>(null);
	const [startingClaim, setStartingClaim] = React.useState(false);
	const [submitted, setSubmitted] = React.useState<{ providerSlug: string; modelCount: number; applicationType: "new" | "claim"; webhookUrl: string; webhookSecret: string | null } | null>(null);
	const [resubmittingProviderSlug, setResubmittingProviderSlug] = React.useState<string | null>(null);
	const [displayTimeZone, setDisplayTimeZone] = React.useState("UTC");
	const displayTimeZoneValid = isTimeZone(displayTimeZone);
	const effectiveDisplayTimeZone = displayTimeZoneValid ? displayTimeZone.trim() : tx("SettingsUI.strings.UTC" as never);
	const catalogProviders = initialData.catalogProviders ?? initialData.linkedProviders;
	const latestSubmissionIdByProvider = new Map<string, string>();
	for (const submission of initialData.submissions) {
		if (!latestSubmissionIdByProvider.has(submission.provider_slug)) latestSubmissionIdByProvider.set(submission.provider_slug, submission.id);
	}

	React.useEffect(() => {
		setDisplayTimeZone(browserTimeZone());
	}, []);

	function updateName(value: string) {
		setProviderName(value);
		if (!slugTouched) setProviderSlug(slugify(value));
	}

	function reviseApplication(submission: SettingsProviderOnboardingInitialData["submissions"][number]) {
		setApplicationType(submission.application_type);
		setProviderName(submission.provider_name);
		setProviderSlug(submission.provider_slug);
		setSlugTouched(true);
		setWebsiteUrl(submission.website_url);
		setLogoUrl(submission.logo_url ?? "");
		setCatalogMode(submission.catalog_mode);
		setCatalogUrl(submission.catalog_url ?? "");
		setPreview(null);
		setClaim(null);
		setSubmitted(null);
		setResubmittingProviderSlug(submission.provider_slug);
		setShowConnection(true);
		window.setTimeout(() => document.getElementById("provider-application-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
	}

	async function checkCatalog() {
		if (!catalogUrl.trim()) return toast.error(s("phraseAddYourCatalogURLFirst"));
		setChecking(true);
		try {
			const result = await fetchAccountWebApi<{
				ok: true;
				catalogUrl: string;
				sha256: string;
				preview: ProviderCatalogPreview;
			}>(
				"/api/account/settings/provider-onboarding/preview",
				await getBrowserAccessToken(),
				{ method: "POST", body: JSON.stringify({ catalogUrl: catalogUrl.trim() }) },
			);
			setPreview(result.preview);
			if (result.preview.valid) toast.success(`${s("Catalog checked")} · ${result.preview.modelCount} ${s("models found")}`);
			else toast.error(t("identity.current.previewIssues", { count: result.preview.issues.length }));
		} catch (error) {
			setPreview(null);
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not check catalog")));
		} finally { setChecking(false); }
	}

	async function submit() {
		if (catalogMode === "remote" && !preview?.valid) return toast.error(tx("SettingsUI.strings.phraseCheckAValidCatalogBeforeSubmitting" as never));
		const existingClaimOwner = applicationType === "claim"
			&& resubmittingProviderSlug === providerSlug
			&& initialData.linkedProviders.some((provider) => provider.provider_slug === providerSlug && (provider.status === "active" || (provider.status === "pending" && Boolean(provider.verified_at))));
		if (applicationType === "claim" && !claim && !existingClaimOwner) return toast.error(t("identity.current.proofRequired"));
		setSubmitting(true);
		try {
			const result = await fetchAccountWebApi<{
				ok: true;
				message: string;
				provider: { provider_slug: string; name: string; status: string; routable: boolean; routing_enabled: boolean };
				submission: { id: string; provider_slug: string; provider_name: string; status: string; model_count: number; submitted_at: string };
				catalogSync: { deliveryMode: string; webhookUrl: string; webhookSecret: string | null };
				applicationType: "new" | "claim";
				providerWorkspaceId: string;
			}>(
				"/api/account/settings/provider-onboarding/submit",
				await getBrowserAccessToken(),
				{ method: "POST", body: JSON.stringify({ providerName, providerSlug, websiteUrl, logoUrl, catalogMode, catalogUrl: catalogMode === "remote" ? catalogUrl : undefined, claimChallengeId: applicationType === "claim" ? claim?.challengeId : undefined }) },
			);
			setSubmitted({ providerSlug: result.submission.provider_slug, modelCount: result.submission.model_count, applicationType: result.applicationType, webhookUrl: result.catalogSync.webhookUrl, webhookSecret: result.catalogSync.webhookSecret });
			setResubmittingProviderSlug(null);
			toast.success(tx("SettingsUI.strings.Provider profile submitted" as never));
			await invalidateAccountQueries(queryClient);
			await activateProviderAccountAction().catch(() => toast.error(t("identity.current.accountRefresh")));
			router.refresh();
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not submit provider")));
		} finally { setSubmitting(false); }
	}

	async function startClaim() {
		if (!providerSlug.trim() || !websiteUrl.trim()) return toast.error(s("phraseEnterTheProviderSlugAndWebsiteFirst"));
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
			void invalidateAccountQueries(queryClient);
			toast.success(tx("SettingsUI.strings.Webhook signing secret rotated" as never));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", s("Could not rotate webhook secret")));
		}
	}

	const existingClaimOwner = applicationType === "claim"
		&& resubmittingProviderSlug === providerSlug
		&& initialData.linkedProviders.some((provider) => provider.provider_slug === providerSlug && (provider.status === "active" || (provider.status === "pending" && Boolean(provider.verified_at))));
	const profileReady = Boolean(providerName.trim() && providerSlug.trim() && websiteUrl.trim() && (catalogMode === "managed" || catalogUrl.trim()) && (applicationType === "new" || claim || existingClaimOwner));

	return <div className="space-y-7">
		{catalogProviders.length ? <>
			<ProviderCatalogManager providers={catalogProviders.map((provider) => ({ provider_slug: provider.provider_slug, role: provider.role, status: provider.status, canManageCatalog: initialData.isAdmin || provider.canManageCatalog }))} />
			<Button variant="outline" onClick={() => setShowConnection((value) => !value)} aria-expanded={showConnection}>{showConnection ? t("identity.current.closeSetup") : t("identity.current.connectAnother")}</Button>
		</> : null}
		{!catalogProviders.length || showConnection || submitted ? <>
		<p className="text-sm text-muted-foreground">{t("identity.current.intro")}</p>

		{submitted ? <section className="space-y-5 border-y border-amber-200/70 bg-amber-50/40 py-5 dark:border-amber-900/60 dark:bg-amber-950/15"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500 text-white"><BadgeCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="font-medium">{t("identity.current.awaiting", { provider: submitted.providerSlug })}</p><p className="mt-1 text-sm text-muted-foreground">{submitted.applicationType === "claim" ? t("identity.current.claimAwaitingHelp") : t("identity.current.newAwaitingHelp")}</p></div></div><div className="border-t border-amber-200/70 pt-4 dark:border-amber-900/50"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{tx("SettingsUI.identity.webhookDelivery" as never)}</p>{submitted.applicationType === "claim" ? <StatusPill tone="neutral">{t("identity.current.afterApproval")}</StatusPill> : <StatusPill tone="success">{tx("SettingsUI.identity.webhookPolling" as never)}</StatusPill>}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{submitted.applicationType === "claim" ? t("identity.current.webhookAfterApproval") : t("identity.current.webhookHelp")}</p><code className="mt-3 block overflow-x-auto rounded-md bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookUrl}</code>{submitted.webhookSecret ? <><p className="mt-3 text-xs font-medium">{tx("SettingsUI.identity.saveSigningSecret" as never)}</p><p className="text-xs text-muted-foreground">{submitted.applicationType === "claim" ? t("identity.current.secretAfterApproval") : t("identity.current.secretOnce")}</p><code className="mt-1 block overflow-x-auto rounded-md bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookSecret}</code></> : <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-xs text-muted-foreground">{submitted.applicationType === "claim" ? t("identity.current.secretUnchanged") : tx("SettingsUI.identity.signingSecretExists" as never)}</p>{submitted.applicationType === "new" ? <Button type="button" size="sm" variant="outline" onClick={() => void rotateWebhook()}><RefreshCw className="mr-1.5 size-3.5" /> {tx("SettingsUI.identity.rotateSecret" as never)}</Button> : null}</div>}</div></section> : null}

		{!submitted ? <>
		<div id="provider-application-form" className="divide-y divide-border">
			<section className="grid gap-6 py-7 first:pt-0 lg:grid-cols-[minmax(180px,0.34fr)_minmax(0,0.66fr)]">
				<div><h2 className="text-sm font-medium">{tx("SettingsUI.identity.providerProfile" as never)}</h2><p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">{t("identity.current.identityHelp")}</p></div>
				<div className="space-y-5">
					<fieldset className="space-y-2">
						<legend className="text-sm font-medium">{t("identity.current.application")}</legend>
						<div className="grid gap-2 sm:grid-cols-2">
							<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 text-sm has-[:checked]:border-foreground/50 has-[:checked]:bg-muted/40"><input type="radio" name="provider-application-type" value="new" checked={applicationType === "new"} onChange={() => { setApplicationType("new"); setClaim(null); }} className="mt-1 accent-foreground" /><span><span className="block font-medium">{t("identity.current.createProvider")}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("identity.current.newProviderHelp")}</span></span></label>
							<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 text-sm has-[:checked]:border-foreground/50 has-[:checked]:bg-muted/40"><input type="radio" name="provider-application-type" value="claim" checked={applicationType === "claim"} onChange={() => { setApplicationType("claim"); setClaim(null); }} className="mt-1 accent-foreground" /><span><span className="block font-medium">{t("identity.current.claimProvider")}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("identity.current.claimProviderHelp")}</span></span></label>
						</div>
					</fieldset>
						<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-name">{tx("SettingsUI.identity.providerName" as never)}</Label><Input id="provider-name" value={providerName} onChange={(event) => updateName(event.target.value)} placeholder={tx("SettingsUI.identity.providerNamePlaceholder" as never)} autoComplete="organization" /></div><div className="space-y-2"><Label htmlFor="provider-slug">{applicationType === "claim" ? t("identity.current.existingSlug") : t("identity.current.newSlug")}</Label><Input id="provider-slug" value={providerSlug} onChange={(event) => { setClaim(null); setSlugTouched(true); setProviderSlug(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-")); }} placeholder="acme-inference" /><p className="text-[11px] text-muted-foreground">{tx("SettingsUI.identity.providerSlugDescription" as never)}</p></div><div className="space-y-2"><Label htmlFor="provider-website">{tx("SettingsUI.identity.website" as never)}</Label><Input id="provider-website" type="url" value={websiteUrl} onChange={(event) => { setClaim(null); setWebsiteUrl(event.target.value); }} placeholder="https://acme.example" autoComplete="url" /><p className="text-[11px] text-muted-foreground">{t("identity.current.emailHelp")}</p></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-logo">{tx("SettingsUI.identity.logoUrl" as never)}<span className="font-normal text-muted-foreground">{tx("SettingsUI.broadcastControls.optional" as never)}</span></Label><Input id="provider-logo" type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://acme.example/brand/logo.svg" /><p className="text-[11px] text-muted-foreground">{tx("SettingsUI.identity.logoUrlDescription" as never)}</p></div></div>
						{applicationType === "claim" ? <div className="space-y-3 border-t border-border pt-5">{existingClaimOwner ? <p className="text-xs leading-5 text-muted-foreground">{t("identity.current.existingProofHelp")}</p> : <><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{t("identity.current.verifyOwnership")}</p><p className="mt-1 text-xs text-muted-foreground">{t("identity.current.proofHelp")}</p></div><Button type="button" size="sm" variant="outline" disabled={startingClaim || !providerSlug || !websiteUrl} onClick={() => void startClaim()}>{startingClaim ? tx("SettingsUI.identity.creatingProof" as never) : tx("SettingsUI.identity.createProof" as never)}</Button></div>{claim ? <div className="space-y-2 border-l-2 border-foreground/20 pl-3 text-xs"><p>{tx("SettingsUI.identity.publishTokenAt" as never)}</p><code className="block overflow-x-auto">{claim.verificationUrl}</code><code className="block overflow-x-auto font-semibold">{claim.token}</code><p className="text-muted-foreground">{t("identity.current.proofSubmitHelp")}</p></div> : null}</>}</div> : <p className="text-xs leading-5 text-muted-foreground">{t("identity.current.existingSlugHelp")}</p>}
					<p className="text-xs leading-5 text-muted-foreground">{t("identity.current.contactHelp")}</p>
				</div>
			</section>

			<section className="grid gap-6 py-7 lg:grid-cols-[minmax(180px,0.34fr)_minmax(0,0.66fr)]">
				<div><h2 className="text-sm font-medium">{tx("Site.pricing.matrix.copy.model-catalog" as never)}</h2><p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">{t("identity.current.catalogIntro")}</p></div>
				<div className="space-y-5"><div className="space-y-2"><Label htmlFor="provider-catalog-mode">{t("identity.current.catalogManagement")}</Label><Select value={catalogMode} onValueChange={(value) => setCatalogMode(value as "managed" | "remote")}><SelectTrigger id="provider-catalog-mode" className="w-full"><SelectValue>{catalogMode === "managed" ? t("identity.current.managedCatalog") : t("identity.current.remoteCatalog")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="managed">{t("identity.current.managedCatalog")}</SelectItem><SelectItem value="remote">{t("identity.current.remoteCatalog")}</SelectItem></SelectContent></Select></div>{catalogMode === "managed" ? <p className="text-sm text-muted-foreground">{t("identity.current.managedHelp")}</p> : <><div className="space-y-2"><Label htmlFor="provider-catalog">{tx("SettingsUI.identity.modelsListUrl" as never)}</Label><div className="flex gap-2"><Input id="provider-catalog" type="url" value={catalogUrl} onChange={(event) => { setCatalogUrl(event.target.value); setPreview(null); }} placeholder="https://acme.example/.well-known/phaseo/models.json" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void checkCatalog(); } }} /><Button type="button" variant="outline" size="icon" onClick={() => void checkCatalog()} disabled={checking || !catalogUrl.trim()} aria-label={tx("SettingsUI.identity.checkCatalog" as never)}>{checking ? <RefreshCw className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div><p className="text-[11px] leading-5 text-muted-foreground">{t("identity.current.catalogUrlHelp")}</p><p className="text-[11px] leading-5 text-muted-foreground">{t.rich("identity.current.canonicalModelHelp", { code: chunks => <code className="rounded bg-muted px-1">{chunks}</code> })}</p><p className="text-[11px] leading-5 text-muted-foreground">{t.rich("identity.current.releaseOffsetHelp", { code: chunks => <code className="rounded bg-muted px-1">{chunks}</code> })}</p><div className="flex flex-wrap gap-3 text-xs"><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.schemaUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> {t("identity.current.schema")}</a><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.openApiUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> {t("identity.current.webhookSchema")}</a></div></div>
					<div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-4"><div className="flex gap-3"><Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-medium">{tx("SettingsUI.identity.whatWeCheck" as never)}</p><p className="text-xs leading-5 text-muted-foreground">{tx("SettingsUI.strings.phraseModelIDsEndpointCapabilitiesModalitiesParametersLimitsAndASafeResponseSizeASuccessfulPreviewDoesNotTurnTrafficOn" as never)}</p></div></div></div>
					{preview ? <div className={cn("rounded-xl border p-3.5", preview.valid ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20")}><div className="flex items-start gap-3"><div className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", preview.valid ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>{preview.valid ? <Check className="size-4" /> : <CircleAlert className="size-4" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{t(preview.valid ? "identity.current.previewModels" : "identity.current.previewIssues", { count: preview.valid ? preview.modelCount : preview.issues.length })}</p>{preview.valid ? <p className="mt-1 text-xs text-muted-foreground">{t("identity.current.validCatalogHelp")}</p> : <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{preview.issues.map((issue) => <p key={`${issue.path}:${issue.message}`} className="text-xs text-amber-800 dark:text-amber-200"><span className="font-mono">{issue.path}</span> {tx("Product.gatewayBenchmark.notAvailable" as never)}{localizedProviderCatalogMessage(issue.message, t)}</p>)}</div>}</div></div></div> : null}
					</>}</div>
			</section>

		<div className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> {t("identity.current.routingHelp")}</div><Button type="button" onClick={() => void submit()} disabled={!profileReady || (catalogMode === "remote" && !preview?.valid) || submitting}>{submitting ? tx("SettingsUI.strings.Submitting…" as never) : resubmittingProviderSlug ? t("identity.current.resubmit") : t("identity.current.submit")}<Send className="ml-1 size-3.5" /></Button></div>
		</div>

		{preview?.valid ? <Card className="border-border/70"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between"><div className="space-y-1"><p className="text-sm font-medium">{t("identity.current.releaseDisplay")}</p><p className="max-w-2xl text-xs leading-5 text-muted-foreground">{t("identity.current.timezoneHelp")}</p></div><div className="w-full space-y-2 sm:max-w-xs"><Label htmlFor="provider-catalog-timezone">{t("identity.current.timezone")}</Label><Input id="provider-catalog-timezone" list="provider-catalog-timezones" value={displayTimeZone} onChange={(event) => setDisplayTimeZone(event.target.value)} aria-invalid={!displayTimeZoneValid} placeholder="Europe/London" /><datalist id="provider-catalog-timezones">{Array.from(new Set([browserTimeZone(), ...SUGGESTED_TIME_ZONES])).map((timeZone) => <option key={timeZone} value={timeZone} />)}</datalist>{displayTimeZoneValid ? <p className="text-[11px] text-muted-foreground">{t("identity.current.showingTimezone", { zone: effectiveDisplayTimeZone })}</p> : <p className="text-[11px] text-destructive">{t("identity.current.invalidTimezone")}</p>}</div></CardContent></Card> : null}
		{preview?.valid ? <Card className="overflow-hidden border-border/70"><CardHeader className="flex flex-row items-end justify-between gap-4 border-b border-border/60"><div><CardTitle>{tx("SettingsUI.identity.catalogPreview" as never)}</CardTitle><CardDescription className="mt-1">{tx("SettingsUI.strings.phraseASampleOfWhatPhaseoReceivedFromYourURL" as never)}</CardDescription></div><span className="font-mono text-[11px] text-muted-foreground">{t(preview.truncated ? "identity.current.firstShown" : "identity.current.shown", { count: preview.truncated ? 100 : preview.models.length })}</span></CardHeader><CardContent className="p-0"><div className="grid max-h-[32rem] overflow-y-auto sm:grid-cols-2">{preview.models.map((model) => <PreviewModel key={model.id} model={model} displayTimeZone={effectiveDisplayTimeZone} />)}</div></CardContent></Card> : null}
		</> : null}

		</> : null}
		{initialData.reviewRevisions.length ? (
			<section className="space-y-3">
				<div>
					<h2 className="font-heading text-base font-medium">{t("identity.current.revisions")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("identity.current.revisionHelp")}</p>
				</div>
				<div className="divide-y divide-border border-y border-border">
					{initialData.reviewRevisions.slice(0, 5).map((revision, index) => {
						const revisionLabel = status("reviewStatus", revision.review_status);
						const revisionTone = revision.review_status === "approved"
							? "success"
							: revision.review_status === "pending" || revision.review_status === "in_progress" || revision.review_status === "needs_changes"
								? "warning"
								: "neutral";

						return (
							<details key={revision.id} className="group" open={index === 0}>
								<summary className="flex cursor-pointer list-none items-center gap-3 py-4 marker:hidden">
									<ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{revision.provider_slug}</p>
										<p className="mt-0.5 text-xs text-muted-foreground">{date(revision.created_at)} · {revision.model_count ?? revision.models.length} {tx("Site.homeOpenSourceMarketing.models" as never)}</p>
									</div>
									<StatusPill tone={revisionTone}>{revisionLabel}</StatusPill>
								</summary>
								<div className="mb-4 ml-7 overflow-hidden rounded-lg border border-border/70">
									{revision.error_message ? <p className="border-b border-border/60 px-3 py-3 text-sm text-destructive">{localizedProviderCatalogMessage(revision.error_message, t)}</p> : null}
									{revision.models.slice(0, 100).map((model) => (
										<div key={`${revision.id}:${model.model_slug}`} className="flex items-start gap-3 border-b border-border/60 px-3 py-3 last:border-0">
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">{model.name}</p>
												<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{model.model_slug} · {model.provider_model_slug}</p>
												<p className="mt-1 text-xs text-muted-foreground">{model.match_type === "new_model" ? tx("Product.internalTools.dataEditor.newModel" as never) : model.match_type ? t("identity.current.matchedBy", { type: status("matchType", model.match_type) }) : tx("SettingsUI.identity.matching" as never)} · {status("availability", model.availability)} · {status("routeStatus", model.route_projection_status)}</p>
												{model.decision_reason ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{model.decision_reason === "Automatically matched to an existing canonical model." ? t("identity.catalogValidation.automaticMatch") : model.decision_reason}</p> : null}
											</div>
											<StatusPill tone={model.decision === "approved" ? "success" : model.decision === "pending" || model.decision === "needs_changes" ? "warning" : "neutral"}>{status("decision", model.decision)}</StatusPill>
										</div>
									))}
								</div>
							</details>
						);
					})}
				</div>
			</section>
		) : null}

		{initialData.events.length ? <section className="space-y-3"><div><h2 className="font-heading text-base font-medium">{tx("SettingsUI.identity.notifications" as never)}</h2><p className="mt-1 text-sm text-muted-foreground">{t("identity.current.eventsHelp")}</p></div><div className="overflow-hidden rounded-xl border border-border/70">{initialData.events.slice(0, 10).map((event) => <div key={event.id} className="border-b border-border/60 px-4 py-3 last:border-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{localizedProviderEvent(event, t).title}</p><span className="text-[11px] text-muted-foreground">{date(event.created_at)}</span></div><p className="mt-1 text-xs text-muted-foreground">{localizedProviderEvent(event, t).message}</p></div>)}</div></section> : null}

		<section className="space-y-3"><div className="flex items-end justify-between gap-4"><div><h2 className="font-heading text-base font-medium">{tx("SettingsUI.identity.yourProviderActivity" as never)}</h2><p className="mt-1 text-sm text-muted-foreground">{t("identity.current.activityHelp")}</p></div></div>{initialData.linkedProviders.length || initialData.submissions.length ? <div className="overflow-hidden rounded-xl border border-border/70">{initialData.linkedProviders.map((provider) => <div key={provider.provider_slug} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><BadgeCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{provider.provider_slug}</p><p className="text-xs text-muted-foreground">{t("identity.current.linkedRole", { role: status("role", provider.role) })} · {provider.status === "active" ? t("identity.current.verified", { date: date(provider.verified_at) }) : provider.verified_at ? t("identity.current.claimVerified", { date: date(provider.verified_at) }) : t("identity.current.verificationPending")}</p></div><StatusPill tone={provider.status === "active" ? "success" : "warning"}>{provider.status === "active" ? t("identity.current.linked") : provider.verified_at ? t("identity.current.claimReview") : tx("SettingsUI.identity.reviewStatus.pending" as never)}</StatusPill></div>)}{initialData.submissions.map((submission) => <div key={submission.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Send className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{submission.provider_name}</p><p className="truncate text-xs text-muted-foreground">{t("identity.current.submittedModels", { count: submission.model_count, date: date(submission.submitted_at ?? submission.created_at) })}</p></div><div className="flex min-w-0 flex-col items-end gap-1"><StatusPill tone={applicationStatusTone(submission.provider_review_status)}>{applicationStatusLabel(submission.provider_review_status)}</StatusPill>{submission.provider_review_reason ? <p className="max-w-64 text-right text-xs leading-5 text-amber-700 dark:text-amber-300">{submission.provider_review_reason}</p> : null}</div>{submission.provider_review_status === "needs_changes" && latestSubmissionIdByProvider.get(submission.provider_slug) === submission.id ? <Button type="button" size="sm" variant="outline" onClick={() => reviseApplication(submission)}>{t("identity.current.updateApplication")}</Button> : null}<ChevronRight className="size-4 shrink-0 text-muted-foreground" /></div>)}</div> : <div className="rounded-xl border border-dashed border-border/80 px-6 py-10 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-muted/60"><Globe2 className="size-5 text-muted-foreground" /></div><p className="text-sm font-medium">{tx("SettingsUI.identity.noProviderActivity" as never)}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("identity.current.noActivityHelp")}</p></div>}</section>
	</div>;
}
