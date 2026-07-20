"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
	ChevronDown,
	ExternalLink,
	RefreshCw,
	ShieldCheck,
	Wrench,
	X,
} from "lucide-react";
import { toast } from "sonner";
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
import {
	purgeCacheScope,
	verifyCacheAdmin,
	type CachePurgeResult,
} from "@/lib/fetchers/internal/cacheControlClient";
import {
	getCacheControlHref,
	getPageCacheTarget,
	type PageCacheTarget,
} from "./cacheRoute";

export default function AdminDeveloperMenu({ onDismiss }: { onDismiss: () => void }) {
	const [authorized, setAuthorized] = useState(false);
	const [collapsed, setCollapsed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void verifyCacheAdmin()
			.then((allowed) => {
				if (cancelled) return;
				if (allowed) setAuthorized(true);
				else onDismiss();
			})
			.catch(() => {
				if (!cancelled) onDismiss();
			});
		return () => {
			cancelled = true;
		};
	}, [onDismiss]);

	if (!authorized) return null;
	if (collapsed) {
		return (
			<Button
				type="button"
				size="icon"
				className="fixed right-4 top-20 z-40 rounded-full shadow-xl"
				onClick={() => setCollapsed(false)}
				aria-label="Expand admin developer menu"
			>
				<Wrench className="size-4" />
			</Button>
		);
	}

	return <DeveloperPanel onCollapse={() => setCollapsed(true)} onDismiss={onDismiss} />;
}

function DeveloperPanel({
	onCollapse,
	onDismiss,
}: {
	onCollapse: () => void;
	onDismiss: () => void;
}) {
	const pathname = usePathname() ?? "/";
	const target = getPageCacheTarget(pathname);
	const targetKey = target ? `${target.scope}:${target.targetId ?? "global"}` : pathname;

	return (
		<Card className="fixed right-4 top-20 z-40 w-[min(24rem,calc(100vw-2rem))] border-primary/20 bg-background/95 shadow-2xl backdrop-blur">
			<CardHeader className="gap-3 pb-3">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<CardTitle className="text-base">Developer menu</CardTitle>
							<Badge variant="secondary"><ShieldCheck className="size-3" /> Admin</Badge>
						</div>
						<CardDescription className="break-all font-mono text-[11px]">{pathname}</CardDescription>
					</div>
					<div className="flex gap-1">
						<Button type="button" variant="ghost" size="icon-sm" onClick={onCollapse} aria-label="Collapse developer menu">
							<ChevronDown className="size-4" />
						</Button>
						<Button type="button" variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Close developer menu">
							<X className="size-4" />
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<RouteCacheAction key={targetKey} target={target} />
				<div className="flex items-center justify-between border-t pt-3">
					<Button variant="ghost" size="sm" asChild>
						<Link href={getCacheControlHref(target)}>
							Cache Control Centre <ExternalLink className="size-3.5" />
						</Link>
					</Button>
					<kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Ctrl ⇧ .</kbd>
				</div>
			</CardContent>
		</Card>
	);
}

function RouteCacheAction({ target }: { target: PageCacheTarget | null }) {
	const [confirming, setConfirming] = useState(false);
	const [refreshBrowsers, setRefreshBrowsers] = useState(target?.affectsSearch ?? false);
	const [lastResult, setLastResult] = useState<CachePurgeResult | null>(null);
	const [isPending, startTransition] = useTransition();

	if (!target) {
		return (
			<div className="rounded-xl border border-dashed p-3">
				<div className="text-sm font-medium">No page cache mapping</div>
				<p className="mt-1 text-xs text-muted-foreground">Use the full Cache Control Centre for this route.</p>
			</div>
		);
	}
	const resolvedTarget = target;

	function confirmRevalidation() {
		startTransition(async () => {
			try {
				const result = await purgeCacheScope({
					scope: resolvedTarget.scope,
					targetId: resolvedTarget.targetId,
					bumpBrowserGeneration: refreshBrowsers,
				});
				setLastResult(result);
				setConfirming(false);
				toast.success(`${resolvedTarget.label} cache revalidated`);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : String(error));
			}
		});
	}

	return (
		<>
			<div className="rounded-xl border bg-muted/30 p-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-medium">{target.label}</div>
						<p className="mt-1 break-all text-xs text-muted-foreground">{target.description}</p>
					</div>
					<Badge variant="outline">{target.scope}</Badge>
				</div>
				{target.affectsSearch ? (
					<label className="mt-3 flex items-start gap-2 text-xs">
						<Checkbox checked={refreshBrowsers} onCheckedChange={(checked) => setRefreshBrowsers(checked === true)} />
						<span><span className="font-medium">Refresh returning browser tabs</span><br /><span className="text-muted-foreground">Advance the search generation after the edge purge.</span></span>
					</label>
				) : null}
			</div>

			<Button type="button" className="w-full" onClick={() => setConfirming(true)} disabled={isPending}>
				<RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
				{isPending ? "Revalidating…" : "Revalidate this page"}
			</Button>
			{lastResult ? (
				<p className="text-xs text-emerald-700 dark:text-emerald-400">
					Purged {lastResult.tags.length} tags
					{lastResult.generation ? ` · search generation ${lastResult.generation}` : ""}.
				</p>
			) : null}

			<AlertDialog open={confirming} onOpenChange={(open) => { if (!open && !isPending) setConfirming(false); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revalidate {target.label.toLowerCase()}?</AlertDialogTitle>
						<AlertDialogDescription>
							This purges the named Cloudflare Worker scope for {target.description}. The next request in each region may rebuild it.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={isPending} onClick={confirmRevalidation}>
							Confirm revalidation
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
