"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { localizedInternalCatalogError } from "@/i18n/internal-catalog-errors";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { WebApiError, fetchAccountWebApi } from "@/lib/web-api/client";

type Compatibility = {
	successor: string;
	successor_served: boolean;
	missing_input_modalities: string[];
	missing_output_modalities: string[];
	context_length: number | null;
	successor_context_length: number | null;
	blocking: string[];
	warnings: string[];
};

type SuccessorRouting = {
	replacement_model_slug: string | null;
	unserved_since: string | null;
	auto_route_enabled: boolean;
	approved_successor_slug: string | null;
	approved_at: string | null;
	approval_source: "admin" | "auto" | null;
	auto_approval_blocked: boolean;
	approval_current: boolean;
	notes: string | null;
	compatibility: Compatibility | null;
};

const ISSUE_KEYS = [
	"free_to_paid",
	"successor_hidden",
	"successor_inactive",
	"missing_input_modalities",
	"missing_output_modalities",
	"smaller_context",
	"successor_not_served",
] as const;

const PATH = "/api/account/models/catalog/successor-routing";

export default function ModelSuccessorRoutingPanel({ modelId }: { modelId: string }) {
	const t = useTranslations("Product.internalTools.dataEditor.successorRouting");
	const tx = useTranslations();
	const locale = useLocale();
	const [routing, setRouting] = useState<SuccessorRouting | null>(null);
	const [notes, setNotes] = useState("");
	const [allowWarnings, setAllowWarnings] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const load = useCallback(async () => {
		try {
			const result = await fetchAccountWebApi<{ routing: SuccessorRouting }>(`${PATH}?model=${encodeURIComponent(modelId)}`, await getBrowserAccessToken());
			setRouting(result.routing);
			setNotes(result.routing.notes ?? "");
			setError(null);
		} catch (loadError) {
			setError(localizedInternalCatalogError(loadError, tx, "Product.internalTools.dataEditor.successorRouting.loadFailed"));
		}
	}, [modelId, tx]);

	useEffect(() => {
		void load();
	}, [load]);

	const save = (enabled: boolean) => {
		setError(null);
		startTransition(async () => {
			try {
				const result = await fetchAccountWebApi<{ routing: SuccessorRouting }>(PATH, await getBrowserAccessToken(), {
					method: "POST",
					body: JSON.stringify({ model: modelId, enabled, allowWarnings, notes: notes.trim() || null }),
				});
				setRouting(result.routing);
				setAllowWarnings(false);
			} catch (saveError) {
				setError(saveError instanceof WebApiError && saveError.status === 409
					? t("rejected")
					: localizedInternalCatalogError(saveError, tx, "Product.internalTools.dataEditor.successorRouting.saveFailed"));
			}
		});
	};

	const formatDate = (value: string) => new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
	const compatibility = routing?.compatibility ?? null;
	const issueLabel = (issue: string) => (ISSUE_KEYS as readonly string[]).includes(issue) ? t(`issues.${issue as (typeof ISSUE_KEYS)[number]}`) : issue;
	const hasWarnings = (compatibility?.warnings.length ?? 0) > 0;
	const canApprove = Boolean(compatibility) && compatibility!.blocking.length === 0 && (!hasWarnings || allowWarnings);

	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div>
				<h2 className="text-sm font-medium">{t("title")}</h2>
				<p className="text-xs text-muted-foreground">{t("description")}</p>
			</div>
			{routing ? (
				<dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
					<dt className="text-muted-foreground">{t("replacement")}</dt>
					<dd className="font-mono text-xs">{routing.replacement_model_slug ?? t("noReplacement")}</dd>
					<dt className="text-muted-foreground">{t("serving")}</dt>
					<dd>{routing.unserved_since ? t("unservedSince", { date: formatDate(routing.unserved_since) }) : t("served")}</dd>
					<dt className="text-muted-foreground">{t("approval")}</dt>
					<dd>
						{!routing.auto_route_enabled || !routing.approved_successor_slug || !routing.approved_at
							? t("notApproved")
							: routing.approval_current
								? t(routing.approval_source === "auto" ? "approvedAutomatically" : "approved", { model: routing.approved_successor_slug, date: formatDate(routing.approved_at) })
								: t("approvalStale", { model: routing.approved_successor_slug })}
					</dd>
				</dl>
			) : null}
			{routing?.auto_approval_blocked ? <p className="text-xs text-muted-foreground">{t("autoBlocked")}</p> : null}
			{compatibility ? (
				<div className="space-y-1 text-xs">
					{compatibility.blocking.length > 0 ? (
						<p className="text-red-700 dark:text-red-400">{t("blocking", { issues: compatibility.blocking.map(issueLabel).join(", ") })}</p>
					) : null}
					{hasWarnings ? (
						<p className="text-amber-700 dark:text-amber-400">{t("warnings", { issues: compatibility.warnings.map(issueLabel).join(", ") })}</p>
					) : null}
					{compatibility.blocking.length === 0 && !hasWarnings ? <p className="text-muted-foreground">{t("compatible")}</p> : null}
				</div>
			) : null}
			{routing ? (
				<div className="space-y-2">
					<label className="block space-y-1 text-xs">
						<span className="text-muted-foreground">{t("notes")}</span>
						<textarea
							className="w-full rounded-md border bg-background px-2 py-1 text-sm"
							rows={2}
							maxLength={2000}
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
						/>
					</label>
					{hasWarnings && compatibility!.blocking.length === 0 ? (
						<label className="flex items-center gap-2 text-xs">
							<input type="checkbox" checked={allowWarnings} onChange={(event) => setAllowWarnings(event.target.checked)} />
							{t("acceptWarnings")}
						</label>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button type="button" onClick={() => save(true)} disabled={isPending || !canApprove}>
							{!routing.auto_route_enabled ? t("approve") : routing.approval_current ? t("updateApproval") : t("reapprove")}
						</Button>
						<Button type="button" variant="outline" onClick={() => save(false)} disabled={isPending || (!routing.auto_route_enabled && routing.auto_approval_blocked)}>
							{routing.auto_route_enabled ? t("revoke") : t("blockAuto")}
						</Button>
					</div>
				</div>
			) : null}
			{error ? (
				<p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
			) : null}
		</div>
	);
}
