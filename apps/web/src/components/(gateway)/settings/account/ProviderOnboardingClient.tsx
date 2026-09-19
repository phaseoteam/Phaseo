"use client";

import * as React from "react";
import Link from "next/link";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function formatDate(value: string | null): string {
	if (!value) return "Not yet";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
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

function formatTimestamp(value: string | null, timeZone: string): { local: string; utc: string } | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return {
		local: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date),
		utc: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date),
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
	const [expanded, setExpanded] = React.useState(false);
	const availabilityLabel = model.availability.replaceAll("_", " ");
	const availabilityTone = model.availability === "ready" ? "success" : model.availability === "degraded" ? "warning" : "neutral";
	const formatValue = (value: number | null) => value === null ? "Not supplied" : new Intl.NumberFormat("en", { notation: "compact" }).format(value);
	const lifecycleTimestamp = (value: string | null) => {
		const formatted = formatTimestamp(value, displayTimeZone);
		return formatted ? <><p>{formatted.local} <span className="text-muted-foreground">({displayTimeZone})</span></p><p className="mt-0.5 text-[11px] text-muted-foreground">{formatted.utc} UTC</p></> : <p>Not supplied</p>;
	};

	return <div className="border-b border-border/60 last:border-0">
		<div className="group flex items-start gap-3 px-4 py-3.5">
			<div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-foreground/[0.1]">AI</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate text-sm font-medium">{model.name}</p>
					<StatusPill tone="success"><Check className="size-3" /> Valid</StatusPill>
					<StatusPill tone={availabilityTone as "success" | "warning" | "neutral"}>{availabilityLabel}</StatusPill>
				</div>
				<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{model.id}</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{model.capabilities.slice(0, 4).map((capability) => <span key={capability.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{capability.id}</span>)}
					{model.inputModalities.map((modality) => <span key={`in-${modality}`} className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">in: {modality}</span>)}
				</div>
			</div>
			<Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "Hide details" : "View details"}<ChevronDown className={cn("ml-1 size-3.5 transition-transform", expanded && "rotate-180")} /></Button>
		</div>
		{expanded ? <div className="space-y-4 bg-muted/20 px-4 pb-4 pl-15 text-xs">
			{model.description ? <p className="max-w-3xl leading-5 text-muted-foreground">{model.description}</p> : <p className="text-muted-foreground">No description supplied.</p>}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div><p className="font-medium">Provider model</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{model.providerModelSlug}</p></div>
				<div><p className="font-medium">Context window</p><p className="mt-1 text-muted-foreground">{formatValue(model.contextLength)} tokens</p></div>
				<div><p className="font-medium">Max output</p><p className="mt-1 text-muted-foreground">{formatValue(model.maxOutputTokens)} tokens</p></div>
				<div><p className="font-medium">Output</p><p className="mt-1 text-muted-foreground">{model.outputModalities.join(", ") || "Not supplied"}</p></div>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<div><p className="font-medium">Available from</p><div className="mt-1 text-muted-foreground">{lifecycleTimestamp(model.availableFrom)}</div></div>
				<div><p className="font-medium">Deprecated</p><div className="mt-1 text-muted-foreground">{lifecycleTimestamp(model.deprecatedAt)}</div></div>
				<div><p className="font-medium">Shutdown</p><div className="mt-1 text-muted-foreground">{lifecycleTimestamp(model.shutdownAt)}</div></div>
			</div>
			<div><p className="font-medium">Capabilities and parameters</p><div className="mt-2 flex flex-wrap gap-2">{model.capabilities.map((capability) => <span key={capability.id} className="rounded-md border border-border/60 bg-background px-2 py-1 text-muted-foreground">{capability.id}{capability.parameters.length ? ` · ${capability.parameters.join(", ")}` : ""}</span>)}</div></div>
			<div><p className="font-medium">Pricing meters</p>{model.pricing.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{model.pricing.map((price) => <div key={`${price.meterKey}:${price.modality}:${price.direction ?? ""}`} className="rounded-lg border border-border/60 bg-background px-3 py-2"><p className="font-medium">{price.displayLabel}</p><p className="mt-1 text-muted-foreground">{price.meterKey} · {price.modality}{price.direction ? ` · ${price.direction}` : ""}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{price.displayUnit} · {price.unit}</p></div>)}</div> : <p className="mt-1 text-muted-foreground">No pricing meters supplied.</p>}</div>
		</div> : null}
	</div>;
}

export default function ProviderOnboardingClient({ initialData }: Props) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [showConnection, setShowConnection] = React.useState(false);
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
	const [submitted, setSubmitted] = React.useState<{ providerSlug: string; modelCount: number; webhookUrl: string; webhookSecret: string | null } | null>(null);
	const [displayTimeZone, setDisplayTimeZone] = React.useState("UTC");
	const displayTimeZoneValid = isTimeZone(displayTimeZone);
	const effectiveDisplayTimeZone = displayTimeZoneValid ? displayTimeZone.trim() : "UTC";
	const catalogProviders = initialData.catalogProviders ?? initialData.linkedProviders;

	React.useEffect(() => {
		setDisplayTimeZone(browserTimeZone());
	}, []);

	function updateName(value: string) {
		setProviderName(value);
		if (!slugTouched) setProviderSlug(slugify(value));
	}

	async function checkCatalog() {
		if (!catalogUrl.trim()) return toast.error("Add your catalog URL first.");
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
			if (result.preview.valid) toast.success(`Catalog checked · ${result.preview.modelCount} models found`);
			else toast.error(`${result.preview.issues.length} catalog issue${result.preview.issues.length === 1 ? "" : "s"} found`);
		} catch (error) {
			setPreview(null);
			toast.error(error instanceof Error ? error.message : "Could not check catalog");
		} finally { setChecking(false); }
	}

	async function submit() {
		if (catalogMode === "remote" && !preview?.valid) return toast.error("Check a valid catalog before submitting.");
		setSubmitting(true);
		try {
			const result = await fetchAccountWebApi<{
				ok: true;
				message: string;
				provider: { provider_slug: string; name: string; status: string; routable: boolean; routing_enabled: boolean };
				submission: { id: string; provider_slug: string; provider_name: string; status: string; model_count: number; submitted_at: string };
				catalogSync: { deliveryMode: string; webhookUrl: string; webhookSecret: string | null };
				providerWorkspaceId: string;
			}>(
				"/api/account/settings/provider-onboarding/submit",
				await getBrowserAccessToken(),
				{ method: "POST", body: JSON.stringify({ providerName, providerSlug, websiteUrl, logoUrl, catalogMode, catalogUrl: catalogMode === "remote" ? catalogUrl : undefined, claimChallengeId: claim?.challengeId }) },
			);
			setSubmitted({ providerSlug: result.submission.provider_slug, modelCount: result.submission.model_count, webhookUrl: result.catalogSync.webhookUrl, webhookSecret: result.catalogSync.webhookSecret });
			toast.success("Provider profile submitted");
			await invalidateAccountQueries(queryClient);
			await activateProviderAccountAction().catch(() => toast.error("Provider connected. Sign in again to refresh your account workspace."));
			router.refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not submit provider");
		} finally { setSubmitting(false); }
	}

	async function startClaim() {
		if (!providerSlug.trim() || !websiteUrl.trim()) return toast.error("Enter the provider slug and website first.");
		setStartingClaim(true);
		try { const result = await startProviderClaimAction(providerSlug, websiteUrl); setClaim(result); toast.success("Ownership proof created"); }
		catch (error) { toast.error(error instanceof Error ? error.message : "Could not create ownership proof"); }
		finally { setStartingClaim(false); }
	}

	async function rotateWebhook() {
		if (!submitted) return;
		try {
			const result = await rotateProviderCatalogWebhookAction(submitted.providerSlug);
			setSubmitted({ ...submitted, webhookUrl: result.webhookUrl, webhookSecret: result.webhookSecret });
			toast.success("Webhook signing secret rotated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not rotate webhook secret");
		}
	}

	const profileReady = Boolean(providerName.trim() && providerSlug.trim() && websiteUrl.trim() && (catalogMode === "managed" || catalogUrl.trim()));

	return <div className="space-y-7">
		{catalogProviders.length ? <>
			<ProviderCatalogManager providers={catalogProviders.map((provider) => ({ provider_slug: provider.provider_slug, role: provider.role, status: provider.status }))} />
			<Button variant="outline" onClick={() => setShowConnection((value) => !value)} aria-expanded={showConnection}>{showConnection ? "Close provider setup" : "Connect another provider"}</Button>
		</> : null}
		{!catalogProviders.length || showConnection || submitted ? <>
		<p className="text-sm text-muted-foreground">Enroll to manage the models your provider supports. You can stage and test the integration while public traffic stays off until Phaseo approves the provider.</p>

	{submitted ? <section className="space-y-5 border-y border-amber-200/70 bg-amber-50/40 py-5 dark:border-amber-900/60 dark:bg-amber-950/15"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500 text-white"><BadgeCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="font-medium">{submitted.providerSlug} is awaiting Phaseo approval.</p><p className="mt-1 text-sm text-muted-foreground">You can stage models and test the integration now. Public listing and routing stay disabled until an admin approves the provider.</p></div><Button asChild variant="outline"><Link href="/settings/provider/models">Manage models</Link></Button></div><div className="border-t border-amber-200/70 pt-4 dark:border-amber-900/50"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Webhook delivery</p><StatusPill tone="success">Webhook + polling</StatusPill></div><p className="mt-1 text-xs leading-5 text-muted-foreground">POST a signed event when your catalog changes. Polling remains available as a backstop.</p><code className="mt-3 block overflow-x-auto rounded-md bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookUrl}</code>{submitted.webhookSecret ? <><p className="mt-3 text-xs font-medium">Signing secret — save this now</p><code className="mt-1 block overflow-x-auto rounded-md bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookSecret}</code></> : <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-xs text-muted-foreground">A signing secret already exists for this provider.</p><Button type="button" size="sm" variant="outline" onClick={() => void rotateWebhook()}><RefreshCw className="mr-1.5 size-3.5" /> Rotate secret</Button></div>}</div></section> : null}

		<div className="divide-y divide-border">
			<section className="grid gap-6 py-7 first:pt-0 lg:grid-cols-[minmax(180px,0.34fr)_minmax(0,0.66fr)]">
				<div><h2 className="text-sm font-medium">Provider profile</h2><p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">The public identity attached to your submission.</p></div>
				<div className="space-y-5">
					<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" value={providerName} onChange={(event) => updateName(event.target.value)} placeholder="e.g. Acme Inference" autoComplete="organization" /></div><div className="space-y-2"><Label htmlFor="provider-slug">Provider slug</Label><Input id="provider-slug" value={providerSlug} onChange={(event) => { setClaim(null); setSlugTouched(true); setProviderSlug(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-")); }} placeholder="acme-inference" /><p className="text-[11px] text-muted-foreground">Used in provider URLs and routing metadata.</p></div><div className="space-y-2"><Label htmlFor="provider-website">Website</Label><Input id="provider-website" type="url" value={websiteUrl} onChange={(event) => { setClaim(null); setWebsiteUrl(event.target.value); }} placeholder="https://acme.example" autoComplete="url" /><p className="text-[11px] text-muted-foreground">Your signed-in account email must use this organisation’s domain.</p></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-logo">Logo URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="provider-logo" type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://acme.example/brand/logo.svg" /><p className="text-[11px] text-muted-foreground">Use a stable HTTPS image URL. We’ll review it with the provider profile.</p></div></div>
					<p className="text-xs leading-5 text-muted-foreground">Your account becomes the controlling contact for this provider profile. A provider slug that is already claimed cannot be overwritten.</p>
					<div className="space-y-3 border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Claim an existing profile</p><p className="mt-1 text-xs text-muted-foreground">Create a one-hour domain proof only when this provider slug already exists.</p></div><Button type="button" size="sm" variant="outline" disabled={startingClaim || !providerSlug || !websiteUrl} onClick={() => void startClaim()}>{startingClaim ? "Creating…" : "Create proof"}</Button></div>{claim ? <div className="space-y-2 border-l-2 border-foreground/20 pl-3 text-xs"><p>Publish this token as plain text at:</p><code className="block overflow-x-auto">{claim.verificationUrl}</code><code className="block overflow-x-auto font-semibold">{claim.token}</code><p className="text-muted-foreground">Leave the file in place, then submit the provider form.</p></div> : null}</div>
				</div>
			</section>

			<section className="grid gap-6 py-7 lg:grid-cols-[minmax(180px,0.34fr)_minmax(0,0.66fr)]">
				<div><h2 className="text-sm font-medium">Model catalog</h2><p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">Manage models in Phaseo or import a remote catalog.</p></div>
				<div className="space-y-5"><div className="space-y-2"><Label htmlFor="provider-catalog-mode">Catalog management</Label><select id="provider-catalog-mode" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={catalogMode} onChange={(event) => setCatalogMode(event.target.value as "managed" | "remote")}><option value="managed">Manage in Phaseo</option><option value="remote">Import from URL</option></select></div>{catalogMode === "managed" ? <p className="text-sm text-muted-foreground">Add models after enrollment using the editor or catalog API. No publicly hosted catalog is required.</p> : <><div className="space-y-2"><Label htmlFor="provider-catalog">Models list URL</Label><div className="flex gap-2"><Input id="provider-catalog" type="url" value={catalogUrl} onChange={(event) => { setCatalogUrl(event.target.value); setPreview(null); }} placeholder="https://acme.example/.well-known/phaseo/models.json" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void checkCatalog(); } }} /><Button type="button" variant="outline" size="icon" onClick={() => void checkCatalog()} disabled={checking || !catalogUrl.trim()} aria-label="Check catalog">{checking ? <RefreshCw className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div><p className="text-[11px] leading-5 text-muted-foreground">The URL must return JSON using the Phaseo provider catalog shape and be hosted on your provider domain.</p><p className="text-[11px] leading-5 text-muted-foreground">Use a canonical Phaseo <code className="rounded bg-muted px-1">id</code> to support an existing model. Unknown IDs become new model proposals.</p><p className="text-[11px] leading-5 text-muted-foreground">Set <code className="rounded bg-muted px-1">available_from</code> with your local offset to stage a release. Phaseo handles UTC conversion.</p><div className="flex flex-wrap gap-3 text-xs"><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.schemaUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> JSON Schema</a><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.openApiUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> Webhook OpenAPI</a></div></div>
					<div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-4"><div className="flex gap-3"><Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-medium">What we check</p><p className="text-xs leading-5 text-muted-foreground">Model IDs, endpoint capabilities, modalities, parameters, limits, and a safe response size. A successful preview does not turn traffic on.</p></div></div></div>
					{preview ? <div className={cn("rounded-xl border p-3.5", preview.valid ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20")}><div className="flex items-start gap-3"><div className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", preview.valid ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>{preview.valid ? <Check className="size-4" /> : <CircleAlert className="size-4" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{preview.valid ? `${preview.modelCount} models ready to preview` : "Catalog needs a few fixes"}</p>{preview.valid ? <p className="mt-1 text-xs text-muted-foreground">The provider catalog shape is valid. Review the models below, then submit when you’re ready.</p> : <div className="mt-2 space-y-1">{preview.issues.slice(0, 4).map((issue) => <p key={`${issue.path}:${issue.message}`} className="text-xs text-amber-800 dark:text-amber-200"><span className="font-mono">{issue.path}</span> — {issue.message}</p>)}</div>}</div></div></div> : null}
					</>}</div>
			</section>

			<div className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Traffic remains disabled until review is complete.</div><Button type="button" onClick={() => void submit()} disabled={!profileReady || (catalogMode === "remote" && !preview?.valid) || submitting}>{submitting ? "Submitting…" : "Submit provider"}<Send className="ml-1 size-3.5" /></Button></div>
		</div>

		{preview?.valid ? <Card className="border-border/70"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between"><div className="space-y-1"><p className="text-sm font-medium">Release time display</p><p className="max-w-2xl text-xs leading-5 text-muted-foreground">Lifecycle times are stored as one unambiguous instant. Change the timezone to review the same release in your team’s local time; the UTC value remains visible underneath.</p></div><div className="w-full space-y-2 sm:max-w-xs"><Label htmlFor="provider-catalog-timezone">Display timezone</Label><Input id="provider-catalog-timezone" list="provider-catalog-timezones" value={displayTimeZone} onChange={(event) => setDisplayTimeZone(event.target.value)} aria-invalid={!displayTimeZoneValid} placeholder="Europe/London" /><datalist id="provider-catalog-timezones">{Array.from(new Set([browserTimeZone(), ...SUGGESTED_TIME_ZONES])).map((timeZone) => <option key={timeZone} value={timeZone} />)}</datalist>{displayTimeZoneValid ? <p className="text-[11px] text-muted-foreground">Showing times in {effectiveDisplayTimeZone}.</p> : <p className="text-[11px] text-destructive">Enter a valid IANA timezone, such as Europe/London.</p>}</div></CardContent></Card> : null}
		{preview?.valid ? <Card className="overflow-hidden border-border/70"><CardHeader className="flex flex-row items-end justify-between gap-4 border-b border-border/60"><div><CardTitle>Catalog preview</CardTitle><CardDescription className="mt-1">A sample of what Phaseo received from your URL.</CardDescription></div><span className="font-mono text-[11px] text-muted-foreground">{preview.truncated ? "first 100 shown" : `${preview.models.length} shown`}</span></CardHeader><CardContent className="p-0"><div className="grid max-h-[32rem] overflow-y-auto sm:grid-cols-2">{preview.models.map((model) => <PreviewModel key={model.id} model={model} displayTimeZone={effectiveDisplayTimeZone} />)}</div></CardContent></Card> : null}

		</> : null}
		{initialData.reviewRevisions.length ? (
			<section className="space-y-3">
				<div>
					<h2 className="font-heading text-base font-medium">Catalog revisions</h2>
					<p className="mt-1 text-sm text-muted-foreground">Review progress for submitted catalog changes.</p>
				</div>
				<div className="divide-y divide-border border-y border-border">
					{initialData.reviewRevisions.slice(0, 5).map((revision, index) => {
						const revisionLabel = revision.review_status === "partially_approved"
							? "Partially approved"
							: revision.review_status.replaceAll("_", " ");
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
										<p className="mt-0.5 text-xs text-muted-foreground">{formatDate(revision.created_at)} · {revision.model_count ?? revision.models.length} models</p>
									</div>
									<StatusPill tone={revisionTone}>{revisionLabel}</StatusPill>
								</summary>
								<div className="mb-4 ml-7 overflow-hidden rounded-lg border border-border/70">
									{revision.models.slice(0, 100).map((model) => (
										<div key={`${revision.id}:${model.model_slug}`} className="flex items-start gap-3 border-b border-border/60 px-3 py-3 last:border-0">
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">{model.name}</p>
												<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{model.model_slug} · {model.provider_model_slug}</p>
												<p className="mt-1 text-xs text-muted-foreground">{model.match_type === "new_model" ? "New model" : model.match_type ? `Matched by ${model.match_type}` : "Matching"} · {model.availability.replaceAll("_", " ")} · {model.route_projection_status.replaceAll("_", " ")}</p>
												{model.decision_reason ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{model.decision_reason}</p> : null}
											</div>
											<StatusPill tone={model.decision === "approved" ? "success" : model.decision === "pending" || model.decision === "needs_changes" ? "warning" : "neutral"}>{model.decision.replaceAll("_", " ")}</StatusPill>
										</div>
									))}
								</div>
							</details>
						);
					})}
				</div>
			</section>
		) : null}

		{initialData.events.length ? <section className="space-y-3"><div><h2 className="font-heading text-base font-medium">Notifications</h2><p className="mt-1 text-sm text-muted-foreground">Catalog sync and review events for your provider accounts.</p></div><div className="overflow-hidden rounded-xl border border-border/70">{initialData.events.slice(0, 10).map((event) => <div key={event.id} className="border-b border-border/60 px-4 py-3 last:border-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{event.title}</p><span className="text-[11px] text-muted-foreground">{formatDate(event.created_at)}</span></div><p className="mt-1 text-xs text-muted-foreground">{event.message}</p></div>)}</div></section> : null}

		<section className="space-y-3"><div className="flex items-end justify-between gap-4"><div><h2 className="font-heading text-base font-medium">Your provider activity</h2><p className="mt-1 text-sm text-muted-foreground">Submissions and account links stay visible here for auditability.</p></div></div>{initialData.linkedProviders.length || initialData.submissions.length ? <div className="overflow-hidden rounded-xl border border-border/70">{initialData.linkedProviders.map((provider) => <div key={provider.provider_slug} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><BadgeCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{provider.provider_slug}</p><p className="text-xs text-muted-foreground">Linked as {provider.role} · {provider.status === "active" ? `verified ${formatDate(provider.verified_at)}` : "ownership verification pending"}</p></div><StatusPill tone={provider.status === "active" ? "success" : "warning"}>{provider.status === "active" ? "Linked" : "Pending"}</StatusPill></div>)}{initialData.submissions.map((submission) => <div key={submission.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Send className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{submission.provider_name}</p><p className="truncate text-xs text-muted-foreground">{submission.model_count} models · submitted {formatDate(submission.submitted_at ?? submission.created_at)}</p></div><StatusPill tone={submission.status === "published" ? "success" : "warning"}>{submission.status === "submitted" ? "In review" : submission.status}</StatusPill><ChevronRight className="size-4 text-muted-foreground" /></div>)}</div> : <div className="rounded-xl border border-dashed border-border/80 px-6 py-10 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-muted/60"><Globe2 className="size-5 text-muted-foreground" /></div><p className="text-sm font-medium">No provider activity yet</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Once you submit a provider, its account link and catalog checks will appear here.</p></div>}</section>
	</div>;
}
