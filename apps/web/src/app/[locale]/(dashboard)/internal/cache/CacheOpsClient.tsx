"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
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
	type CacheControlState,
	type CachePurgeResult,
	type CacheScope,
} from "@/lib/fetchers/internal/cacheControlClient";
import { purgeCacheScopeAction } from "./actions";

type PendingPurge = { scope: CacheScope; targetId: string };

const SCOPE_KEYS: Record<string, string> = {
	search: "search",
	catalogue: "catalogue",
	model: "model",
	provider: "provider",
	organisation: "organisation",
	benchmark: "benchmark",
	apps: "apps",
	landing: "landing",
	rankings: "rankings",
	updates: "updates",
	pricing: "pricing",
	"all-public": "allPublic",
};

const TARGET_LABEL_KEYS: Record<string, string> = {
	model: "model",
	provider: "provider",
	organisation: "organisation",
	benchmark: "benchmark",
	apps: "apps",
};

function formatTimestamp(value: string, locale: string) {
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export default function CacheOpsClient() {
	const locale = useLocale();
	const t = useTranslations("Product.internalTools.cacheOps");
	const tInternal = useTranslations("Product.internalTools");
	const tScopes = useTranslations("Product.developerMenu.scopes");
	const [state, setState] = useState<CacheControlState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [targets, setTargets] = useState<Record<string, string>>({});
	const [pendingPurge, setPendingPurge] = useState<PendingPurge | null>(null);
	const [bumpBrowserGeneration, setBumpBrowserGeneration] = useState(true);
	const [destructiveConfirmation, setDestructiveConfirmation] = useState("");
	const [lastResult, setLastResult] = useState<CachePurgeResult | null>(null);
	const [isPending, startTransition] = useTransition();

	const scopeLabel = (id: string) => {
		const key = SCOPE_KEYS[id];
		return key ? tScopes(key as never) : t("unknownScope");
	};
	const targetLabel = (id: string) => {
		const key = TARGET_LABEL_KEYS[id];
		return key ? t(`targetLabels.${key}` as never) : t("unknownScope");
	};

	const loadState = useCallback(async () => {
		try {
			setError(null);
			setState(await fetchCacheControlState());
		} catch (loadError) {
			console.error("Failed to load cache controls", loadError);
			setError(t("loadFailure"));
		}
	}, [t]);

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
		() => state?.scopes.filter((scope) => !TARGET_LABEL_KEYS[scope.id] && scope.id !== "all-public") ?? [],
		[state],
	);
	const targetedScopes = useMemo(
		() => state?.scopes.filter((scope) => Boolean(TARGET_LABEL_KEYS[scope.id])) ?? [],
		[state],
	);
	const destructiveScope = state?.scopes.find((scope) => scope.id === "all-public");

	function preparePurge(scope: CacheScope) {
		const targetId = targets[scope.id]?.trim() ?? "";
		if (scope.targetRequired && !targetId) {
			toast.error(t("targetRequired", { target: targetLabel(scope.id) }));
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
				const result = await purgeCacheScopeAction({
					scope: scope.id as Parameters<typeof purgeCacheScopeAction>[0]["scope"],
					targetId: targetId || undefined,
					bumpBrowserGeneration,
				});
				setLastResult(result);
				setPendingPurge(null);
				toast.success(t("purgeSuccess", { scope: scopeLabel(scope.id) }));
				await loadState();
			} catch (purgeError) {
				console.error("Failed to purge cache scope", purgeError);
				toast.error(t("purgeFailure"));
			}
		});
	}

	return (
		<div className="container mx-auto max-w-6xl space-y-6 py-8">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-semibold">{tInternal("cacheControlCentreTitle")}</h1>
						{generation ? <Badge variant="secondary">{t("generationUpdated", { generation: generation.generation })}</Badge> : null}
					</div>
					<p className="max-w-2xl text-sm text-muted-foreground">
						{tInternal("cacheControlCentreDescription")}
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => void loadState()} disabled={isPending}>
						<RefreshCw className="size-4" /> {t("refreshStatus")}
					</Button>
					<Button variant="outline" size="sm" render={<Link href="/internal" />}>{t("backToInternal")}</Button>
				</div>
			</div>

			<Alert>
				<ShieldAlert className="size-4" />
					<AlertTitle>{t("automaticTitle")}</AlertTitle>
					<AlertDescription>
						{t("automaticDescription")}
				</AlertDescription>
			</Alert>

			{error ? (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>{t("unavailableTitle")}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{lastResult ? (
				<Alert>
					<CheckCircle2 className="size-4 text-emerald-600" />
					<AlertTitle>{t("purgeCompletedTitle")}</AlertTitle>
					<AlertDescription>
						{t("completedSummary", { count: lastResult.tags.length, date: formatTimestamp(lastResult.purgedAt, locale) })}
						{lastResult.generation !== null ? ` ${t("generationUpdated", { generation: lastResult.generation })}` : ""}
						{lastResult.generationWarning ? ` ${t("generationWarning")}` : ""}
					</AlertDescription>
				</Alert>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>{t("quickScopes")}</CardTitle>
					<CardDescription>{t("quickScopesDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{quickScopes.map((scope) => (
						<div key={scope.id} className="flex min-h-36 flex-col rounded-2xl border p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="font-medium">{scopeLabel(scope.id)}</div>
								<Badge variant="outline">{t("tagCount", { count: scope.tagCount })}</Badge>
							</div>
							<p className="mt-2 flex-1 text-sm text-muted-foreground">{t("quickScopeDescription")}</p>
							<Button className="mt-4 w-full" variant="outline" onClick={() => preparePurge(scope)} disabled={isPending}>
								{t("purgeScope")}
							</Button>
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("targetedScopes")}</CardTitle>
					<CardDescription>{t("targetedScopesDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					{targetedScopes.map((scope) => (
						<div key={scope.id} className="space-y-3 rounded-2xl border p-4">
							<div>
								<div className="font-medium">{scopeLabel(scope.id)}</div>
								<p className="mt-1 text-sm text-muted-foreground">{t("targetScopeDescription")}</p>
							</div>
							<Input
								value={targets[scope.id] ?? ""}
								onChange={(event) => setTargets((current) => ({ ...current, [scope.id]: event.target.value }))}
								placeholder={targetLabel(scope.id)}
								aria-label={targetLabel(scope.id)}
							/>
							<Button variant="outline" onClick={() => preparePurge(scope)} disabled={isPending || (scope.targetRequired && !(targets[scope.id] ?? "").trim())}>
								{scope.targetRequired || (targets[scope.id] ?? "").trim() ? t("purgeTarget") : t("purgeGlobalScope")}
							</Button>
						</div>
					))}
				</CardContent>
			</Card>

			{destructiveScope ? (
				<Card className="border-destructive/40">
					<CardHeader>
						<CardTitle className="text-destructive">{t("incidentRecovery")}</CardTitle>
						<CardDescription>{t("quickScopeDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button variant="destructive" onClick={() => preparePurge(destructiveScope)} disabled={isPending}>
							{t("purgeGlobalScope")}
						</Button>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><History className="size-4" /> {t("recentOperations")}</CardTitle>
					<CardDescription>{t("recentOperationsDescription")}</CardDescription>
				</CardHeader>
				<CardContent>
					{state?.events.length ? (
						<div className="divide-y rounded-2xl border">
							{state.events.map((event) => (
								<div key={event.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
									<div>
										<span className="font-medium">{scopeLabel(event.scope)}</span>
										{event.target_id ? <span className="text-muted-foreground"> · {event.target_id}</span> : null}
										<span className="text-muted-foreground"> · {t("tagCount", { count: event.tags.length })}</span>
									</div>
									<div className="flex items-center gap-2 text-muted-foreground">
										<Badge variant={event.purge_succeeded ? "secondary" : "destructive"}>{event.purge_succeeded ? t("eventSucceeded") : t("eventFailed")}</Badge>
										<span>{formatTimestamp(event.created_at, locale)}</span>
									</div>
								</div>
							))}
						</div>
					) : <p className="text-sm text-muted-foreground">{t("noOperations")}</p>}
				</CardContent>
			</Card>

			<AlertDialog open={Boolean(pendingPurge)} onOpenChange={(open) => { if (!open && !isPending) setPendingPurge(null); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("confirmTitle", { scope: pendingPurge ? scopeLabel(pendingPurge.scope.id) : "" })}</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingPurge?.targetId
								? t("confirmDescriptionWithTarget", { count: pendingPurge.scope.tagCount, target: pendingPurge.targetId })
								: t("confirmDescription", { count: pendingPurge?.scope.tagCount ?? 0 })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{pendingPurge?.scope.affectsSearch ? (
						<label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
							<Checkbox checked={bumpBrowserGeneration} onCheckedChange={(checked) => setBumpBrowserGeneration(checked === true)} />
							<span><span className="font-medium">{t("refreshTabs")}</span><br /><span className="text-muted-foreground">{t("refreshTabsDescription")}</span></span>
						</label>
					) : null}
					{pendingPurge?.scope.danger === "high" ? (
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="purge-confirmation">{t("typePurge")}</label>
							<Input id="purge-confirmation" value={destructiveConfirmation} onChange={(event) => setDestructiveConfirmation(event.target.value)} autoComplete="off" />
						</div>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant={pendingPurge?.scope.danger === "high" ? "destructive" : "default"}
							disabled={isPending || (pendingPurge?.scope.danger === "high" && destructiveConfirmation !== "PURGE")}
							onClick={confirmPurge}
						>
							{isPending ? t("purging") : t("confirmPurge")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
