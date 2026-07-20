"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, History, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	fetchCacheControlState,
	purgeCacheScope,
	type CacheControlState,
	type CachePurgeResult,
	type CacheScope,
} from "@/lib/fetchers/internal/cacheControlClient";

type PendingPurge = { scope: CacheScope; targetId: string };

function formatTimestamp(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export default function CacheOpsClient() {
	const [state, setState] = useState<CacheControlState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [targets, setTargets] = useState<Record<string, string>>({});
	const [pendingPurge, setPendingPurge] = useState<PendingPurge | null>(null);
	const [bumpBrowserGeneration, setBumpBrowserGeneration] = useState(true);
	const [destructiveConfirmation, setDestructiveConfirmation] = useState("");
	const [lastResult, setLastResult] = useState<CachePurgeResult | null>(null);
	const [isPending, startTransition] = useTransition();

	const loadState = useCallback(async () => {
		try {
			setError(null);
			setState(await fetchCacheControlState());
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : String(loadError));
		}
	}, []);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			void loadState();
			const params = new URLSearchParams(window.location.search);
			const scopeId = params.get("scope");
			const targetId = params.get("target");
			if (scopeId && targetId) setTargets((current) => ({ ...current, [scopeId]: targetId }));
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [loadState]);

	const generation = state?.generations.find((item) => item.scope === "search");
	const quickScopes = useMemo(
		() => state?.scopes.filter((scope) => !scope.targetLabel && scope.id !== "all-public") ?? [],
		[state],
	);
	const targetedScopes = useMemo(
		() => state?.scopes.filter((scope) => Boolean(scope.targetLabel)) ?? [],
		[state],
	);
	const destructiveScope = state?.scopes.find((scope) => scope.id === "all-public");

	function preparePurge(scope: CacheScope) {
		const targetId = targets[scope.id]?.trim() ?? "";
		if (scope.targetRequired && !targetId) {
			toast.error(`${scope.targetLabel ?? "Target"} is required`);
			return;
		}
		setBumpBrowserGeneration(scope.affectsSearch);
		setDestructiveConfirmation("");
		setPendingPurge({ scope, targetId });
	}

	function confirmPurge() {
		if (!pendingPurge) return;
		const { scope, targetId } = pendingPurge;
		startTransition(async () => {
			try {
				const result = await purgeCacheScope({
					scope: scope.id,
					targetId: targetId || undefined,
					bumpBrowserGeneration,
				});
				setLastResult(result);
				setPendingPurge(null);
				toast.success(`${scope.label} cache purged`);
				await loadState();
			} catch (purgeError) {
				toast.error(purgeError instanceof Error ? purgeError.message : String(purgeError));
			}
		});
	}

	return (
		<div className="container mx-auto max-w-6xl space-y-6 py-8">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-semibold">Cache Control Centre</h1>
						{generation ? <Badge variant="secondary">Search generation {generation.generation}</Badge> : null}
					</div>
					<p className="max-w-2xl text-sm text-muted-foreground">
						Purge named Cloudflare Worker cache families without redeploying or exposing Cloudflare credentials.
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => void loadState()} disabled={isPending}>
						<RefreshCw className="size-4" /> Refresh status
					</Button>
					<Button variant="outline" size="sm" render={<Link href="/internal" />}>Back to Internal</Button>
				</div>
			</div>

			<Alert>
				<ShieldAlert className="size-4" />
				<AlertTitle>Automatic invalidation remains the normal path</AlertTitle>
				<AlertDescription>
					Use this page for imports, repairs, or incident recovery. Edge purges cannot remove an object already stored in a visitor&apos;s browser, so search-aware scopes can also advance a tiny browser generation marker.
				</AlertDescription>
			</Alert>

			{error ? (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>Cache controls unavailable</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{lastResult ? (
				<Alert>
					<CheckCircle2 className="size-4 text-emerald-600" />
					<AlertTitle>Cloudflare purge completed</AlertTitle>
					<AlertDescription>
						Purged {lastResult.tags.length} tags at {formatTimestamp(lastResult.purgedAt)}.
						{lastResult.generation ? ` Search generation is now ${lastResult.generation}.` : ""}
						{lastResult.generationWarning ? ` ${lastResult.generationWarning}` : ""}
					</AlertDescription>
				</Alert>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Quick scopes</CardTitle>
					<CardDescription>Broad but bounded operations for common data changes.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{quickScopes.map((scope) => (
						<div key={scope.id} className="flex min-h-36 flex-col rounded-2xl border p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="font-medium">{scope.label}</div>
								<Badge variant="outline">{scope.tagCount} tags</Badge>
							</div>
							<p className="mt-2 flex-1 text-sm text-muted-foreground">{scope.description}</p>
							<Button className="mt-4 w-full" variant="outline" onClick={() => preparePurge(scope)} disabled={isPending}>
								Purge scope
							</Button>
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Targeted scopes</CardTitle>
					<CardDescription>Use the canonical ID from the data editor or the public URL.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					{targetedScopes.map((scope) => (
						<div key={scope.id} className="space-y-3 rounded-2xl border p-4">
							<div>
								<div className="font-medium">{scope.label}</div>
								<p className="mt-1 text-sm text-muted-foreground">{scope.description}</p>
							</div>
							<Input
								value={targets[scope.id] ?? ""}
								onChange={(event) => setTargets((current) => ({ ...current, [scope.id]: event.target.value }))}
								placeholder={scope.targetPlaceholder}
								aria-label={scope.targetLabel}
							/>
							<Button variant="outline" onClick={() => preparePurge(scope)} disabled={isPending || (scope.targetRequired && !(targets[scope.id] ?? "").trim())}>
								Purge {scope.targetRequired ? "target" : (targets[scope.id] ?? "").trim() ? "target" : "global scope"}
							</Button>
						</div>
					))}
				</CardContent>
			</Card>

			{destructiveScope ? (
				<Card className="border-destructive/40">
					<CardHeader>
						<CardTitle className="text-destructive">Incident recovery</CardTitle>
						<CardDescription>{destructiveScope.description}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button variant="destructive" onClick={() => preparePurge(destructiveScope)} disabled={isPending}>
							Purge all named public Worker caches
						</Button>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><History className="size-4" /> Recent operations</CardTitle>
					<CardDescription>Server-side audit trail for the latest 25 manual purge attempts.</CardDescription>
				</CardHeader>
				<CardContent>
					{state?.events.length ? (
						<div className="divide-y rounded-2xl border">
							{state.events.map((event) => (
								<div key={event.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
									<div>
										<span className="font-medium">{event.scope}</span>
										{event.target_id ? <span className="text-muted-foreground"> · {event.target_id}</span> : null}
										<span className="text-muted-foreground"> · {event.tags.length} tags</span>
									</div>
									<div className="flex items-center gap-2 text-muted-foreground">
										<Badge variant={event.purge_succeeded ? "secondary" : "destructive"}>{event.purge_succeeded ? "Succeeded" : "Failed"}</Badge>
										<span>{formatTimestamp(event.created_at)}</span>
									</div>
								</div>
							))}
						</div>
					) : <p className="text-sm text-muted-foreground">No manual purges recorded yet.</p>}
				</CardContent>
			</Card>

			<AlertDialog open={Boolean(pendingPurge)} onOpenChange={(open) => { if (!open && !isPending) setPendingPurge(null); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Purge {pendingPurge?.scope.label}?</AlertDialogTitle>
						<AlertDialogDescription>
							Cloudflare will evict {pendingPurge?.scope.tagCount ?? 0} named cache tags
							{pendingPurge?.targetId ? ` for ${pendingPurge.targetId}` : ""}. The next request in each region may rebuild the affected data.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{pendingPurge?.scope.affectsSearch ? (
						<label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
							<Checkbox checked={bumpBrowserGeneration} onCheckedChange={(checked) => setBumpBrowserGeneration(checked === true)} />
							<span><span className="font-medium">Refresh open browser tabs</span><br /><span className="text-muted-foreground">Advance the search generation so returning tabs discover new models without a hard refresh.</span></span>
						</label>
					) : null}
					{pendingPurge?.scope.danger === "high" ? (
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="purge-confirmation">Type PURGE to continue</label>
							<Input id="purge-confirmation" value={destructiveConfirmation} onChange={(event) => setDestructiveConfirmation(event.target.value)} autoComplete="off" />
						</div>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant={pendingPurge?.scope.danger === "high" ? "destructive" : "default"}
							disabled={isPending || (pendingPurge?.scope.danger === "high" && destructiveConfirmation !== "PURGE")}
							onClick={confirmPurge}
						>
							{isPending ? "Purging…" : "Confirm purge"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
