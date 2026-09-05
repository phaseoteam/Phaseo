"use client";

import * as React from "react";
import {
	ArrowRight,
	BadgeCheck,
	Building2,
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { previewProviderCatalogAction, rotateProviderCatalogWebhookAction, startProviderClaimAction, submitProviderOnboardingAction, type ProviderCatalogPreview } from "@/app/(dashboard)/settings/workspaces/provider/actions";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";

type Props = { initialData: SettingsProviderOnboardingInitialData };

function slugify(value: string): string {
	return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function formatDate(value: string | null): string {
	if (!value) return "Not yet";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
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
	return <div className="group flex items-start gap-3 border-b border-border/60 px-4 py-3.5 last:border-0">
		<div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-foreground/[0.1]">AI</div>
		<div className="min-w-0 flex-1">
			<div className="flex flex-wrap items-center gap-2">
				<p className="truncate text-sm font-medium">{model.name}</p>
				<StatusPill tone="success"><Check className="size-3" /> Valid</StatusPill>
			</div>
			<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{model.id}</p>
			<div className="mt-2 flex flex-wrap gap-1.5">
				{model.capabilities.slice(0, 3).map((capability) => <span key={capability.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{capability.id}</span>)}
				{model.inputModalities.map((modality) => <span key={`in-${modality}`} className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">in: {modality}</span>)}
			</div>
		</div>
	</div>;
}

export default function ProviderWorkspaceClient({ initialData }: Props) {
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
		if (!catalogUrl.trim()) return toast.error("Add your catalog URL first.");
		setChecking(true);
		try {
			const result = await previewProviderCatalogAction(catalogUrl.trim());
			setPreview(result.preview);
			if (result.preview.valid) toast.success(`Catalog checked · ${result.preview.modelCount} models found`);
			else toast.error(`${result.preview.issues.length} catalog issue${result.preview.issues.length === 1 ? "" : "s"} found`);
		} catch (error) {
			setPreview(null);
			toast.error(error instanceof Error ? error.message : "Could not check catalog");
		} finally { setChecking(false); }
	}

	async function submit() {
		if (!preview?.valid) return toast.error("Check a valid catalog before submitting.");
		setSubmitting(true);
		try {
			const result = await submitProviderOnboardingAction({ workspaceId: initialData.workspace.id, providerName, providerSlug, websiteUrl, logoUrl, catalogUrl, claimChallengeId: claim?.challengeId });
			setSubmitted({ providerSlug: result.submission.provider_slug, modelCount: result.submission.model_count, webhookUrl: result.catalogSync.webhookUrl, webhookSecret: result.catalogSync.webhookSecret });
			toast.success("Provider profile submitted");
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

	const profileReady = Boolean(providerName.trim() && providerSlug.trim() && websiteUrl.trim() && catalogUrl.trim());

	if (!initialData.providerEligible) return <div className="border-y border-border/70 py-10"><div className="flex max-w-2xl gap-4"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><Building2 className="size-5 text-muted-foreground" /></div><div><h2 className="font-heading text-lg font-medium">Use an organisation workspace</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Provider identity belongs to an organisation, not your personal workspace. Create or switch to an organisation workspace, then enable provider capabilities there.</p><Button className="mt-5" asChild><a href="/settings/account/workspaces">Manage workspaces</a></Button></div></div></div>;

	if (!initialData.canManageProvider) return <div className="border-y border-border/70 py-10"><h2 className="font-heading text-lg font-medium">Admin access required</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Only workspace owners and admins can configure provider identity and catalog delivery.</p></div>;

	return <div className="space-y-7">
		<section className="flex flex-col gap-4 border-y border-border/70 py-5 sm:flex-row sm:items-center">
			<div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><Building2 className="size-5 text-muted-foreground" /></div>
			<div className="min-w-0 flex-1"><p className="text-sm font-medium">{initialData.workspace.name}</p><p className="mt-1 text-xs text-muted-foreground">Provider capability applies to this workspace. Members inherit access through workspace roles.</p></div>
			<StatusPill>{initialData.linkedProviders.length ? "Provider enabled" : "Not enabled"}</StatusPill>
			{initialData.isAdmin ? <a href="/settings/internal/provider-review" className="inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline">Review queue <ArrowRight className="size-3.5" /></a> : null}
		</section>

	{submitted ? <Card className="overflow-hidden border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"><CardContent className="space-y-4 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><BadgeCheck className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-medium">{submitted.providerSlug} is in the verification queue.</p><p className="mt-1 text-sm text-muted-foreground">{submitted.modelCount} models were captured. The profile is linked to your account, but routes stay off until adapter and endpoint checks are complete.</p></div><Button variant="outline" onClick={() => setSubmitted(null)}>Submit another version</Button></div><div className="rounded-xl border border-emerald-200/70 bg-white/60 p-4 dark:border-emerald-900/50 dark:bg-black/10"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Webhook delivery</p><StatusPill tone="success">Webhook + polling</StatusPill></div><p className="mt-1 text-xs leading-5 text-muted-foreground">POST a signed event here when your catalog changes. Polling remains enabled as a backstop.</p><code className="mt-3 block overflow-x-auto rounded-lg bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookUrl}</code>{submitted.webhookSecret ? <><p className="mt-3 text-xs font-medium">Signing secret — save this now</p><code className="mt-1 block overflow-x-auto rounded-lg bg-black/[0.06] px-3 py-2 text-[11px] text-foreground dark:bg-white/[0.06]">{submitted.webhookSecret}</code></> : <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-xs text-muted-foreground">A signing secret already exists for this provider.</p><Button type="button" size="sm" variant="outline" onClick={() => void rotateWebhook()}><RefreshCw className="mr-1.5 size-3.5" /> Rotate secret</Button></div>}<p className="mt-3 text-[11px] leading-5 text-muted-foreground">Sign <code className="rounded bg-black/[0.06] px-1 dark:bg-white/[0.06]">timestamp.body</code> with HMAC-SHA256 and send <code className="rounded bg-black/[0.06] px-1 dark:bg-white/[0.06]">X-Phaseo-Timestamp</code>, <code className="rounded bg-black/[0.06] px-1 dark:bg-white/[0.06]">X-Phaseo-Signature: v1=&lt;hex&gt;</code>, and an event ID.</p></div></CardContent></Card> : null}

		<div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
			<Card className="border-border/70 bg-background/70">
				<CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Provider profile</CardTitle><CardDescription className="mt-1">This is the public identity attached to your submission.</CardDescription></div><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-sm font-semibold text-muted-foreground">{initialOf(providerName)}</div></div></CardHeader>
				<CardContent className="space-y-5">
					<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" value={providerName} onChange={(event) => updateName(event.target.value)} placeholder="e.g. Acme Inference" autoComplete="organization" /></div><div className="space-y-2"><Label htmlFor="provider-slug">Provider slug</Label><Input id="provider-slug" value={providerSlug} onChange={(event) => { setClaim(null); setSlugTouched(true); setProviderSlug(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-")); }} placeholder="acme-inference" /><p className="text-[11px] text-muted-foreground">Used in provider URLs and routing metadata.</p></div><div className="space-y-2"><Label htmlFor="provider-website">Website</Label><Input id="provider-website" type="url" value={websiteUrl} onChange={(event) => { setClaim(null); setWebsiteUrl(event.target.value); }} placeholder="https://acme.example" autoComplete="url" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="provider-logo">Logo URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="provider-logo" type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://acme.example/brand/logo.svg" /><p className="text-[11px] text-muted-foreground">Use a stable HTTPS image URL. We’ll review it with the provider profile.</p></div></div>
					<div className="rounded-xl border border-border/60 bg-muted/25 p-3.5"><div className="flex gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p className="text-xs leading-5 text-muted-foreground">{initialData.workspace.name} becomes the controlling organisation for this provider profile. Your personal account remains separate.</p></div></div>
					<div className="space-y-3 rounded-xl border border-border/60 p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Claim an existing profile</p><p className="mt-1 text-xs text-muted-foreground">Create a one-hour domain proof only when this provider slug already exists.</p></div><Button type="button" size="sm" variant="outline" disabled={startingClaim || !providerSlug || !websiteUrl} onClick={() => void startClaim()}>{startingClaim ? "Creating…" : "Create proof"}</Button></div>{claim ? <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs"><p>Publish this token as plain text at:</p><code className="block overflow-x-auto">{claim.verificationUrl}</code><code className="block overflow-x-auto font-semibold">{claim.token}</code><p className="text-muted-foreground">Leave the file in place, then submit the provider form.</p></div> : null}</div>
				</CardContent>
			</Card>

			<Card className="border-border/70 bg-background/70">
				<CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Live catalog</CardTitle><CardDescription className="mt-1">Give us the HTTPS URL that returns your model list.</CardDescription></div><CloudDownload className="size-5 text-muted-foreground" /></div></CardHeader>
				<CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="provider-catalog">Models list URL</Label><div className="flex gap-2"><Input id="provider-catalog" type="url" value={catalogUrl} onChange={(event) => { setCatalogUrl(event.target.value); setPreview(null); }} placeholder="https://acme.example/.well-known/phaseo/models.json" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void checkCatalog(); } }} /><Button type="button" variant="outline" size="icon" onClick={() => void checkCatalog()} disabled={checking || !catalogUrl.trim()} aria-label="Check catalog">{checking ? <RefreshCw className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}</Button></div><p className="text-[11px] leading-5 text-muted-foreground">The URL must return JSON using the Phaseo provider catalog shape. It must be hosted on your provider website or a subdomain.</p><div className="flex flex-wrap gap-3 text-xs"><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.schemaUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> JSON Schema</a><a className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline" href={initialData.contracts.openApiUrl} target="_blank" rel="noreferrer"><FileJson2 className="size-3.5" /> Webhook OpenAPI</a></div></div>
					<div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-4"><div className="flex gap-3"><Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-medium">What we check</p><p className="text-xs leading-5 text-muted-foreground">Model IDs, endpoint capabilities, modalities, parameters, limits, and a safe response size. A successful preview does not turn traffic on.</p></div></div></div>
					{preview ? <div className={cn("rounded-xl border p-3.5", preview.valid ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20")}><div className="flex items-start gap-3"><div className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", preview.valid ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>{preview.valid ? <Check className="size-4" /> : <CircleAlert className="size-4" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{preview.valid ? `${preview.modelCount} models ready to preview` : "Catalog needs a few fixes"}</p>{preview.valid ? <p className="mt-1 text-xs text-muted-foreground">The provider catalog shape is valid. Review the models below, then submit when you’re ready.</p> : <div className="mt-2 space-y-1">{preview.issues.slice(0, 4).map((issue) => <p key={`${issue.path}:${issue.message}`} className="text-xs text-amber-800 dark:text-amber-200"><span className="font-mono">{issue.path}</span> — {issue.message}</p>)}</div>}</div></div></div> : null}
					<div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> No payment required</div><Button type="button" onClick={() => void submit()} disabled={!profileReady || !preview?.valid || submitting}>{submitting ? "Submitting…" : "Submit provider"}<Send className="ml-1 size-3.5" /></Button></div>
				</CardContent>
			</Card>
		</div>

		{preview?.valid ? <Card className="overflow-hidden border-border/70"><CardHeader className="flex flex-row items-end justify-between gap-4 border-b border-border/60"><div><CardTitle>Catalog preview</CardTitle><CardDescription className="mt-1">A sample of what Phaseo received from your URL.</CardDescription></div><span className="font-mono text-[11px] text-muted-foreground">{preview.truncated ? "first 100 shown" : `${preview.models.length} shown`}</span></CardHeader><CardContent className="p-0"><div className="grid max-h-[32rem] overflow-y-auto sm:grid-cols-2">{preview.models.map((model) => <PreviewModel key={model.id} model={model} />)}</div></CardContent></Card> : null}

		{initialData.reviewRevisions.length ? <section className="space-y-3"><div><h2 className="font-heading text-base font-medium">Review outcomes</h2><p className="mt-1 text-sm text-muted-foreground">Existing models are approved automatically. New canonical models wait for review; every route remains disabled until endpoint checks pass.</p></div><div className="space-y-3">{initialData.reviewRevisions.slice(0, 5).map((revision) => <Card key={revision.id} className="border-border/70"><CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 py-4"><div><CardTitle className="text-sm">Catalog revision</CardTitle><CardDescription className="mt-1">{revision.model_count ?? revision.models.length} models · {formatDate(revision.created_at)}</CardDescription></div><StatusPill tone={revision.review_status === "approved" ? "success" : revision.review_status === "pending" || revision.review_status === "in_progress" || revision.review_status === "needs_changes" ? "warning" : "neutral"}>{revision.review_status === "partially_approved" ? "Partially approved" : revision.review_status.replaceAll("_", " ")}</StatusPill></CardHeader><CardContent className="divide-y divide-border/60 p-0">{revision.models.slice(0, 100).map((model) => <div key={`${revision.id}:${model.model_slug}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{model.name}</p><p className="truncate font-mono text-[11px] text-muted-foreground">{model.model_slug} · {model.provider_model_slug}</p><p className="mt-1 text-[11px] text-muted-foreground">{model.match_type === "new_model" ? "New canonical model" : model.match_type ? `Matched by ${model.match_type}` : "Matching"} · {model.availability.replaceAll("_", " ")} · route {model.route_projection_status.replaceAll("_", " ")}</p>{model.decision_reason ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{model.decision_reason}</p> : null}</div><StatusPill tone={model.decision === "approved" ? "success" : model.decision === "pending" || model.decision === "needs_changes" ? "warning" : "neutral"}>{model.decision.replaceAll("_", " ")}</StatusPill></div>)}</CardContent></Card>)}</div></section> : null}

		{initialData.events.length ? <section className="space-y-3"><div><h2 className="font-heading text-base font-medium">Notifications</h2><p className="mt-1 text-sm text-muted-foreground">Catalog sync and review events for your provider accounts.</p></div><div className="overflow-hidden rounded-xl border border-border/70">{initialData.events.slice(0, 10).map((event) => <div key={event.id} className="border-b border-border/60 px-4 py-3 last:border-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{event.title}</p><span className="text-[11px] text-muted-foreground">{formatDate(event.created_at)}</span></div><p className="mt-1 text-xs text-muted-foreground">{event.message}</p></div>)}</div></section> : null}

		<section className="space-y-3"><div className="flex items-end justify-between gap-4"><div><h2 className="font-heading text-base font-medium">Your provider activity</h2><p className="mt-1 text-sm text-muted-foreground">Submissions and account links stay visible here for auditability.</p></div></div>{initialData.linkedProviders.length || initialData.submissions.length ? <div className="overflow-hidden rounded-xl border border-border/70">{initialData.linkedProviders.map((provider) => <div key={provider.provider_slug} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><BadgeCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{provider.provider_slug}</p><p className="text-xs text-muted-foreground">Linked as {provider.role} · {provider.status === "active" ? `verified ${formatDate(provider.verified_at)}` : "ownership verification pending"}</p></div><StatusPill tone={provider.status === "active" ? "success" : "warning"}>{provider.status === "active" ? "Linked" : "Pending"}</StatusPill></div>)}{initialData.submissions.map((submission) => <div key={submission.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0"><div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Send className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{submission.provider_name}</p><p className="truncate text-xs text-muted-foreground">{submission.model_count} models · submitted {formatDate(submission.submitted_at ?? submission.created_at)}</p></div><StatusPill tone={submission.status === "published" ? "success" : "warning"}>{submission.status === "submitted" ? "In review" : submission.status}</StatusPill><ChevronRight className="size-4 text-muted-foreground" /></div>)}</div> : <div className="rounded-xl border border-dashed border-border/80 px-6 py-10 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-muted/60"><Globe2 className="size-5 text-muted-foreground" /></div><p className="text-sm font-medium">No provider activity yet</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Once you submit a provider, its account link and catalog checks will appear here.</p></div>}</section>
	</div>;
}
