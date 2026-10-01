"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
import { purgeCacheScopeAction } from "@/app/(dashboard)/internal/cache/actions";
import {
	verifyCacheAdmin,
	type CachePurgeResult,
} from "@/lib/fetchers/internal/cacheControlClient";
import {
	getCacheControlHref,
	getPageCacheTarget,
	type PageCacheTarget,
} from "./cacheRoute";

export default function AdminDeveloperMenu({ onDismiss }: { onDismiss: () => void }) {
	const t = useTranslations("Product.developerMenu");
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
				aria-label={t("expandMenu")}
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
	const t = useTranslations("Product.developerMenu");
	const pathname = usePathname() ?? "/";
	const target = getPageCacheTarget(pathname);
	const targetKey = target ? `${target.scope}:${target.targetId ?? "global"}` : pathname;

	return (
		<Card className="fixed right-4 top-20 z-40 w-[min(24rem,calc(100vw-2rem))] border-primary/20 bg-background/95 shadow-2xl backdrop-blur">
			<CardHeader className="gap-3 pb-3">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<CardTitle className="text-base">{t("title")}</CardTitle>
							<Badge variant="secondary"><ShieldCheck className="size-3" /> {t("admin")}</Badge>
						</div>
						<CardDescription className="break-all font-mono text-[11px]">{pathname}</CardDescription>
					</div>
					<div className="flex gap-1">
						<Button type="button" variant="ghost" size="icon-sm" onClick={onCollapse} aria-label={t("collapseMenu")}>
							<ChevronDown className="size-4" />
						</Button>
						<Button type="button" variant="ghost" size="icon-sm" onClick={onDismiss} aria-label={t("closeMenu")}>
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
							{t("cacheControlCentre")} <ExternalLink className="size-3.5" />
						</Link>
					</Button>
					<kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Ctrl ⇧ .</kbd>
				</div>
			</CardContent>
		</Card>
	);
}

function RouteCacheAction({ target }: { target: PageCacheTarget | null }) {
	const t = useTranslations("Product.developerMenu");
	const [confirming, setConfirming] = useState(false);
	const [lastResult, setLastResult] = useState<CachePurgeResult | null>(null);
	const [isPending, startTransition] = useTransition();

	if (!target) {
		return (
			<div className="rounded-xl border border-dashed p-3">
				<div className="text-sm font-medium">{t("noPageCacheMapping")}</div>
				<p className="mt-1 text-xs text-muted-foreground">{t("useFullCacheControlCentre")}</p>
			</div>
		);
	}
	const resolvedTarget = target;

	function confirmRevalidation() {
		startTransition(async () => {
			try {
				const result = await purgeCacheScopeAction({
					scope: resolvedTarget.scope,
					targetId: resolvedTarget.targetId,
				});
				setLastResult(result);
				setConfirming(false);
				toast.success(t("cacheRevalidated", { label: t(resolvedTarget.labelKey as never) }));
				window.location.reload();
			} catch (error) {
				console.error("[AdminDeveloperMenu] Cache revalidation failed", error);
				toast.error(t("revalidationFailed"));
			}
		});
	}

	return (
		<>
			<div className="rounded-xl border bg-muted/30 p-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-medium">{t(target.labelKey as never)}</div>
						<p className="mt-1 break-all text-xs text-muted-foreground">
							{target.descriptionKey ? t(target.descriptionKey as never) : target.description}
						</p>
					</div>
					<Badge variant="outline">{t(`scopes.${target.scope}` as never)}</Badge>
				</div>
			</div>

			<Button type="button" className="w-full" onClick={() => setConfirming(true)} disabled={isPending}>
				<RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
				{isPending ? t("revalidating") : t("revalidateThisPage")}
			</Button>
			{lastResult ? (
				<p className="text-xs text-emerald-700 dark:text-emerald-400">
					{t("purgedTags", { count: lastResult.tags.length })}.
				</p>
			) : null}

			<AlertDialog open={confirming} onOpenChange={(open) => { if (!open && !isPending) setConfirming(false); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("confirmReloadDescription", {
								description: target.descriptionKey ? t(target.descriptionKey as never) : target.description ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction disabled={isPending} onClick={confirmRevalidation}>
							{t("confirmRevalidation")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
