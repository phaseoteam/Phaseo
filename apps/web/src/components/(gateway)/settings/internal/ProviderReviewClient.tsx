"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, Search, X } from "lucide-react";
import { toast } from "sonner";
import { fetchMoreProviderApplicationsAction, promoteProviderRouteCandidateAction, recordProviderRouteProbeAction, reviewProviderApplicationAction, reviewProviderCatalogModelAction } from "@/app/(dashboard)/settings/internal/provider-review/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { InternalProviderApplication, InternalProviderApplicationsPage, InternalProviderCatalogReview } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";

type Props = { initialApplications: InternalProviderApplicationsPage; initialReviews: InternalProviderCatalogReview[] };
type QueueTab = "providers" | "catalog";
type ProviderDecision = "approved" | "paused" | "rejected" | "needs_changes";
type ProviderReasonTarget = { providerSlug: string; decision: Exclude<ProviderDecision, "approved"> };
type ApprovalBlocker = NonNullable<InternalProviderApplication["route_blockers"]>[number];

const REVIEW_PAGE_SIZE = 20;
const APPLICATION_PAGE_SIZE = 20;
const approvalBlockerLabels: Record<ApprovalBlocker, string> = {
	endpoint: "Endpoint",
	adapter: "Adapter",
	credentials: "Credentials",
	probe: "Passing probe",
};

function statusTone(status: string): string {
	if (status === "approved" || status === "promoted" || status === "probe_passed") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
	if (status === "rejected" || status === "needs_changes" || status === "probe_failed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300";
	return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
}

function providerReviewErrorMessage(error: string): string {
	if (error === "provider_contact_required") return "A provider contact email is required before approval.";
	return "Could not update provider review. Refresh the page and try again.";
}

function formatDate(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function providerCatalogLabel(provider: InternalProviderApplication): string {
	if (provider.catalog_mode === "managed") return "Managed in Phaseo";
	if (!provider.catalog_url) return "Not configured";
	try {
		const catalogUrl = new URL(provider.catalog_url);
		return `${catalogUrl.host}${catalogUrl.pathname}`;
	} catch {
		return "Catalog URL configured";
	}
}

function ownershipProofLabel(provider: InternalProviderApplication): string {
	const method = provider.ownership_proof_method;
	const label = method === "domain_file"
		? "Verified domain file"
		: method === "catalog_domain_match"
			? "Catalog domain and email"
			: method === "self_declared"
				? "Provider email"
				: method?.replaceAll("_", " ") || "Not recorded";
	return provider.ownership_proof_subject ? `${label} · ${provider.ownership_proof_subject}` : label;
}

function QueuePagination({ page, pageSize, total, onPageChange, noun }: {
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (nextPage: number) => void;
	noun: string;
}) {
	if (total <= pageSize) return null;
	const pageCount = Math.ceil(total / pageSize);
	const start = page * pageSize + 1;
	const end = Math.min(start + pageSize - 1, total);
	return <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
		<p className="text-xs text-muted-foreground">Showing {start}–{end} of {total} {noun}</p>
		<div className="flex items-center gap-2">
			<Button type="button" size="sm" variant="outline" onClick={() => onPageChange(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft className="size-4" /> Previous</Button>
			<span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">{page + 1} / {pageCount}</span>
			<Button type="button" size="sm" variant="outline" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount} aria-label="Next page">Next <ChevronRight className="size-4" /></Button>
		</div>
	</div>;
}

export default function ProviderReviewClient({ initialApplications, initialReviews }: Props) {
	const [activeQueue, setActiveQueue] = React.useState<QueueTab>("providers");
	const [applications, setApplications] = React.useState(initialApplications.providers);
	const [nextApplicationCursor, setNextApplicationCursor] = React.useState(initialApplications.nextCursor);
	const [loadingMoreApplications, setLoadingMoreApplications] = React.useState(false);
	const [reviews, setReviews] = React.useState(initialReviews);
	const [reasons, setReasons] = React.useState<Record<string, string>>({});
	const [saving, setSaving] = React.useState<string | null>(null);
	const [providerReasonTarget, setProviderReasonTarget] = React.useState<ProviderReasonTarget | null>(null);
	const [applicationQuery, setApplicationQuery] = React.useState("");
	const [showAllApplications, setShowAllApplications] = React.useState(false);
	const [applicationPage, setApplicationPage] = React.useState(0);
	const [reviewQuery, setReviewQuery] = React.useState("");
	const [showAllClaims, setShowAllClaims] = React.useState(false);
	const [reviewPage, setReviewPage] = React.useState(0);

	const openApplications = applications.filter((provider) => !["approved", "paused", "rejected"].includes(provider.review_status));
	const filteredApplications = applications.filter((provider) => {
		if (!showAllApplications && ["approved", "paused", "rejected"].includes(provider.review_status)) return false;
		const query = applicationQuery.trim().toLowerCase();
		return !query || `${provider.name} ${provider.provider_slug} ${provider.contact_email ?? ""}`.toLowerCase().includes(query);
	});
	const visibleApplications = filteredApplications.slice(applicationPage * APPLICATION_PAGE_SIZE, (applicationPage + 1) * APPLICATION_PAGE_SIZE);
	const reviewRows = reviews.flatMap((review) => review.models.map((model) => ({ review, model })));
	const pendingClaimCount = reviewRows.filter(({ model }) => model.decision === "pending").length;
	const filteredReviewRows = reviewRows.filter(({ review, model }) => {
		if (!showAllClaims && model.decision !== "pending") return false;
		const query = reviewQuery.trim().toLowerCase();
		return !query || `${review.provider?.name ?? ""} ${review.provider_slug} ${model.name} ${model.model_slug} ${model.provider_model_slug}`.toLowerCase().includes(query);
	});
	const pageCount = Math.max(1, Math.ceil(filteredReviewRows.length / REVIEW_PAGE_SIZE));
	const visibleReviewRows = filteredReviewRows.slice(reviewPage * REVIEW_PAGE_SIZE, (reviewPage + 1) * REVIEW_PAGE_SIZE);
	const displayedApplicationCount = (count: number) => `${count}${nextApplicationCursor ? "+" : ""}`;

	async function loadMoreApplications() {
		if (!nextApplicationCursor || loadingMoreApplications) return;
		setLoadingMoreApplications(true);
		try {
			const page = await fetchMoreProviderApplicationsAction(nextApplicationCursor);
			setApplications((current) => {
				const bySlug = new Map(current.map((provider) => [provider.provider_slug, provider]));
				for (const provider of page.providers) {
					const existing = bySlug.get(provider.provider_slug);
					if (!existing || (!existing.submitted_at && provider.submitted_at)) bySlug.set(provider.provider_slug, provider);
				}
				return [...bySlug.values()];
			});
			setNextApplicationCursor(page.nextCursor);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not load more provider applications");
		} finally {
			setLoadingMoreApplications(false);
		}
	}

	async function decideProvider(providerSlug: string, decision: ProviderDecision) {
		const key = `provider:${providerSlug}`;
		const reason = reasons[key]?.trim();
		if (decision !== "approved" && !reason) {
			toast.error("Add a reason before changing provider approval.");
			return;
		}
		setSaving(key);
		try {
			const result = await reviewProviderApplicationAction({ providerSlug, decision, reason });
			if (!result.ok) {
				toast.error(providerReviewErrorMessage(result.error));
				return;
			}
			setApplications((current) => current.map((provider) => provider.provider_slug === providerSlug ? { ...provider, review_status: decision, review_reason: decision === "approved" ? null : reason ?? null } : provider));
			setProviderReasonTarget(null);
			toast.success(decision === "approved" ? "Provider approved" : "Provider review updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not update provider review");
		} finally {
			setSaving(null);
		}
	}

	async function decide(runId: string, modelSlug: string, decision: "approved" | "rejected" | "needs_changes") {
		const key = `${runId}:${modelSlug}`;
		const reason = reasons[key]?.trim();
		if (decision !== "approved" && !reason) {
			toast.error("Add a reason before requesting changes or rejecting a model.");
			return;
		}
		setSaving(key);
		try {
			const result = await reviewProviderCatalogModelAction({ runId, modelSlug, decision, reason });
			setReviews((current) => current.map((review) => review.id !== runId ? review : {
				...review,
				review_status: result.reviewStatus,
				review_summary: result.reviewSummary,
				models: review.models.map((model) => model.model_slug !== modelSlug ? model : { ...model, decision, decision_reason: decision === "approved" ? null : reason ?? null, reviewed_at: new Date().toISOString() }),
			}));
			setReviewPage(0);
			toast.success(decision === "approved" ? "Model claim approved" : decision === "needs_changes" ? "Changes requested" : "Model claim rejected");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not save review decision");
		} finally {
			setSaving(null);
		}
	}

	async function probe(runId: string, modelSlug: string, passed: boolean) {
		const key = `${runId}:${modelSlug}`;
		const reason = reasons[key]?.trim();
		if (!passed && !reason) return toast.error("Add the probe failure reason first.");
		setSaving(key);
		try {
			const result = await recordProviderRouteProbeAction({ runId, modelSlug, passed, reason });
			setReviews((current) => current.map((review) => review.id !== runId ? review : { ...review, models: review.models.map((model) => model.model_slug !== modelSlug ? model : { ...model, candidate: model.candidate ? { ...model.candidate, status: result.candidate.status as NonNullable<typeof model.candidate>["status"], probed_at: result.candidate.probed_at } : null }) }));
			toast.success(passed ? "Probe marked as passed" : "Probe failure recorded");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not record probe result");
		} finally {
			setSaving(null);
		}
	}

	async function promote(runId: string, modelSlug: string) {
		const key = `${runId}:${modelSlug}`;
		setSaving(key);
		try {
			await promoteProviderRouteCandidateAction({ runId, modelSlug });
			setReviews((current) => current.map((review) => review.id !== runId ? review : { ...review, models: review.models.map((model) => model.model_slug !== modelSlug ? model : { ...model, candidate: model.candidate ? { ...model.candidate, status: "promoted", promoted_at: new Date().toISOString() } : null }) }));
			toast.success("Provider route promoted");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not promote route");
		} finally {
			setSaving(null);
		}
	}

	return <div className="space-y-5">
		<div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
			<Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<div><p className="text-sm font-medium">Provider approval is separate from route readiness</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">Review the provider application here. Endpoint, adapter, credentials, model approval, and probe checks remain required before any route can serve public traffic.</p></div>
		</div>

		<Tabs value={activeQueue} onValueChange={(value) => setActiveQueue(value as QueueTab)} className="w-full">
			<TabsList className="h-11 w-full sm:w-fit">
					<TabsTrigger value="providers" className="gap-2 px-3">Provider applications <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{displayedApplicationCount(openApplications.length)}</span></TabsTrigger>
				<TabsTrigger value="catalog" className="gap-2 px-3">Model claims <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{pendingClaimCount}</span></TabsTrigger>
			</TabsList>

			<TabsContent value="providers" className="mt-4 space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div><h2 className="text-base font-semibold">Provider applications</h2><p className="mt-1 text-sm text-muted-foreground">Review provider identity and setup before approval.</p></div>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<div className="relative sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={applicationQuery} onChange={(event) => { setApplicationQuery(event.target.value); setApplicationPage(0); }} placeholder="Search loaded providers" aria-label="Search loaded providers" className="pl-9" /></div>
						<div className="flex items-center rounded-lg border border-border p-1">
							<Button type="button" size="sm" variant={showAllApplications ? "ghost" : "secondary"} onClick={() => { setShowAllApplications(false); setApplicationPage(0); }}>Open ({displayedApplicationCount(openApplications.length)})</Button>
							<Button type="button" size="sm" variant={showAllApplications ? "secondary" : "ghost"} onClick={() => { setShowAllApplications(true); setApplicationPage(0); }}>All ({displayedApplicationCount(applications.length)})</Button>
						</div>
					</div>
				</div>

				{filteredApplications.length ? <div className="space-y-3">{visibleApplications.map((provider) => {
					const key = `provider:${provider.provider_slug}`;
					const blockers = provider.route_blockers ?? [];
					const canApprove = Boolean(provider.contact_email);
					const missingRequirements = blockers.map((blocker) => approvalBlockerLabels[blocker]);
					const readinessDescription = provider.technical_ready
						? "Endpoint, adapter, credentials, and probe are ready. Each model still needs catalog review."
						: `Still needed for public routing: ${missingRequirements.join(", ") || "endpoint setup"}. Provider approval can proceed now; these checks keep routing disabled.`;
					const reasonTarget = providerReasonTarget?.providerSlug === provider.provider_slug ? providerReasonTarget : null;
					const reviewReasonId = `provider-review-reason-${provider.provider_slug}`;
					return <Card key={provider.provider_slug} size="sm" className="border-border/70 shadow-none">
						<CardContent className="space-y-4 p-4">
							<div className="flex flex-col gap-4 xl:flex-row xl:items-start">
								<div className="min-w-0 flex-1 space-y-3">
									<div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{provider.name}</CardTitle>{provider.application_type === "claim" ? <span className="inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Ownership claim</span> : null}<span className={cn("inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusTone(provider.review_status))}>{provider.review_status.replaceAll("_", " ")}</span></div>
									<p className="-mt-2 font-mono text-xs text-muted-foreground">{provider.provider_slug}</p>
									<dl className="grid gap-x-6 gap-y-3 rounded-lg bg-muted/30 p-3 text-xs sm:grid-cols-2 2xl:grid-cols-4">
										<div className="min-w-0"><dt className="text-muted-foreground">Contact</dt><dd className="mt-0.5 truncate font-medium">{provider.contact_email ? <a className="underline-offset-4 hover:underline" href={`mailto:${provider.contact_email}`}>{provider.contact_email}</a> : <span className="text-rose-700 dark:text-rose-300">Missing</span>}</dd></div>
										<div className="min-w-0"><dt className="text-muted-foreground">Ownership proof</dt><dd className="mt-0.5 truncate font-medium">{ownershipProofLabel(provider)}{provider.ownership_verified_at ? ` · ${formatDate(provider.ownership_verified_at)}` : ""}</dd></div>
										<div className="min-w-0"><dt className="text-muted-foreground">Website</dt><dd className="mt-0.5 truncate font-medium">{provider.website_url ? <a className="underline-offset-4 hover:underline" href={provider.website_url} target="_blank" rel="noreferrer">{provider.website_url}</a> : "Not provided"}</dd></div>
										<div className="min-w-0"><dt className="text-muted-foreground">Model catalog</dt><dd className="mt-0.5 truncate font-medium">{providerCatalogLabel(provider)} · {provider.application_model_count ?? 0} models</dd></div>
										<div className="min-w-0"><dt className="text-muted-foreground">Submitted</dt><dd className="mt-0.5 truncate font-medium">{provider.submitted_at ? formatDate(provider.submitted_at) : "Unknown"}</dd></div>
										<div className="min-w-0"><dt className="text-muted-foreground">Endpoint</dt><dd className="mt-0.5 truncate font-medium">{provider.base_url || "Not configured"}</dd></div>
									</dl>
									<div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs", provider.technical_ready ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300" : "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200")}>
										{provider.technical_ready ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
										<div><p className="font-medium">{provider.technical_ready ? "Route checks ready" : "Route setup needed"}</p><p className="mt-0.5 leading-5">{readinessDescription}</p></div>
									</div>
									{provider.review_reason ? <p className="text-xs text-rose-700 dark:text-rose-300">Review note: {provider.review_reason}</p> : null}
								</div>
								<div className="grid shrink-0 grid-cols-2 gap-2 xl:w-64">
									<Button type="button" className="col-span-2" onClick={() => void decideProvider(provider.provider_slug, "approved")} disabled={saving === key || !canApprove}><Check className="mr-1.5 size-3.5" /> Approve provider</Button>
									<Button type="button" size="sm" variant="outline" onClick={() => setProviderReasonTarget({ providerSlug: provider.provider_slug, decision: "needs_changes" })} disabled={saving === key}>Request changes</Button>
									<Button type="button" size="sm" variant="outline" onClick={() => setProviderReasonTarget({ providerSlug: provider.provider_slug, decision: "paused" })} disabled={saving === key}>Pause</Button>
									<Button type="button" size="sm" variant="outline" className="col-span-2 text-destructive hover:text-destructive" onClick={() => setProviderReasonTarget({ providerSlug: provider.provider_slug, decision: "rejected" })} disabled={saving === key}><X className="mr-1.5 size-3.5" /> Reject</Button>
								</div>
							</div>
							{reasonTarget ? <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
								<Label htmlFor={reviewReasonId} className="text-xs">Reason for {reasonTarget.decision.replaceAll("_", " ")}</Label>
								<div className="mt-2 flex flex-col gap-2 sm:flex-row"><Input id={reviewReasonId} autoFocus value={reasons[key] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))} placeholder="Add a short review reason" className="text-sm" /><Button type="button" size="sm" onClick={() => void decideProvider(provider.provider_slug, reasonTarget.decision)} disabled={saving === key || !reasons[key]?.trim()}>Save decision</Button><Button type="button" size="sm" variant="ghost" onClick={() => setProviderReasonTarget(null)} disabled={saving === key}>Cancel</Button></div>
							</div> : null}
						</CardContent>
					</Card>;
				})}
					<QueuePagination page={applicationPage} pageSize={APPLICATION_PAGE_SIZE} total={filteredApplications.length} onPageChange={setApplicationPage} noun="provider applications" />
				</div> : <div className="rounded-xl border border-dashed border-border/80 px-6 py-12 text-center"><p className="font-medium">No provider applications found</p><p className="mt-1 text-sm text-muted-foreground">Try a different search or switch to all applications.</p></div>}
				{nextApplicationCursor ? <div className="flex flex-col items-center gap-2 border-t border-border/70 pt-4"><Button type="button" variant="outline" onClick={() => void loadMoreApplications()} disabled={loadingMoreApplications}>{loadingMoreApplications ? "Loading applications…" : "Load more applications"}</Button><p className="text-xs text-muted-foreground">Search and counts include loaded applications only.</p></div> : null}
			</TabsContent>

			<TabsContent value="catalog" className="mt-4 space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div><h2 className="text-base font-semibold">Catalog model claims</h2><p className="mt-1 text-sm text-muted-foreground">Approve claims, record endpoint probes, and promote eligible routes.</p></div>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<div className="relative sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={reviewQuery} onChange={(event) => { setReviewQuery(event.target.value); setReviewPage(0); }} placeholder="Search providers or models" aria-label="Search providers or models" className="pl-9" /></div>
						<div className="flex items-center rounded-lg border border-border p-1">
							<Button type="button" size="sm" variant={showAllClaims ? "ghost" : "secondary"} onClick={() => { setShowAllClaims(false); setReviewPage(0); }}>Needs decision ({pendingClaimCount})</Button>
							<Button type="button" size="sm" variant={showAllClaims ? "secondary" : "ghost"} onClick={() => { setShowAllClaims(true); setReviewPage(0); }}>All claims ({reviewRows.length})</Button>
						</div>
					</div>
				</div>

				{visibleReviewRows.length ? <div className="space-y-3">{visibleReviewRows.map(({ review, model }) => {
					const key = `${review.id}:${model.model_slug}`;
					const pending = model.decision === "pending";
					const reasonId = `review-reason-${review.id}-${model.model_slug}`;
					return <Card key={key} size="sm" className="border-border/70 shadow-none">
						<CardContent className="p-4">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2"><p className="font-medium">{model.name}</p><span className={cn("inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", statusTone(model.decision))}>{model.decision.replaceAll("_", " ")}</span>{model.candidate ? <span className={cn("inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", statusTone(model.candidate.status))}>{model.candidate.status.replaceAll("_", " ")}</span> : null}</div>
									<p className="mt-1 text-xs text-muted-foreground">{review.provider?.name ?? review.provider_slug} · {review.trigger} sync · {formatDate(review.created_at)}</p>
									<p className="mt-2 truncate font-mono text-xs text-muted-foreground">{model.model_slug} <span aria-hidden="true">→</span> {model.provider_model_slug}</p>
									{model.capabilities.length ? <div className="mt-2 flex flex-wrap gap-1.5">{model.capabilities.map((capability) => <span key={capability.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{capability.id}</span>)}</div> : null}
									{model.decision_reason ? <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{model.decision_reason}</p> : null}
								</div>
								<div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[28rem] lg:justify-end">
									{pending ? <><Button type="button" size="sm" onClick={() => void decide(review.id, model.model_slug, "approved")} disabled={saving === key}><Check className="mr-1.5 size-3.5" /> Approve</Button><Button type="button" size="sm" variant="outline" onClick={() => void decide(review.id, model.model_slug, "needs_changes")} disabled={saving === key}><CircleAlert className="mr-1.5 size-3.5" /> Request changes</Button><Button type="button" size="sm" variant="outline" onClick={() => void decide(review.id, model.model_slug, "rejected")} disabled={saving === key}><X className="mr-1.5 size-3.5" /> Reject</Button></> : model.candidate && model.candidate.status !== "promoted" ? <><Button type="button" size="sm" variant="outline" onClick={() => void probe(review.id, model.model_slug, true)} disabled={saving === key}>Probe passed</Button><Button type="button" size="sm" variant="outline" onClick={() => void probe(review.id, model.model_slug, false)} disabled={saving === key}>Probe failed</Button>{model.candidate.status === "probe_passed" ? <Button type="button" size="sm" onClick={() => void promote(review.id, model.model_slug)} disabled={saving === key}>Promote</Button> : null}</> : null}
								</div>
							</div>
							{pending || model.candidate?.status === "pending_probe" || model.candidate?.status === "probe_failed" ? <div className="mt-3 max-w-xl"><Label htmlFor={reasonId} className="text-xs">Review reason or probe note</Label><Input id={reasonId} value={reasons[key] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))} placeholder={pending ? "Required for changes or rejection" : "Required when recording a failed probe"} className="mt-1.5 text-sm" /></div> : null}
						</CardContent>
					</Card>;
				})}
					<QueuePagination page={reviewPage} pageSize={REVIEW_PAGE_SIZE} total={filteredReviewRows.length} onPageChange={(nextPage) => setReviewPage(Math.max(0, Math.min(nextPage, pageCount - 1)))} noun="claims" />
				</div> : <div className="rounded-xl border border-dashed border-border/80 px-6 py-12 text-center"><p className="font-medium">{reviewRows.length ? (showAllClaims ? "No model claims match this search" : "No model claims need a decision") : "No catalog revisions yet"}</p><p className="mt-1 text-sm text-muted-foreground">{reviewRows.length ? "Try another search, or view all claims to review past decisions." : "New validated provider catalog revisions will appear here."}</p>{reviewRows.length && !showAllClaims ? <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { setShowAllClaims(true); setReviewPage(0); }}>View all claims</Button> : null}</div>}
			</TabsContent>
		</Tabs>
	</div>;
}
