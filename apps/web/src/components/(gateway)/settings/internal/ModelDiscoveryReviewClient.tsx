"use client";

import * as React from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Check, Clock3, ExternalLink, X } from "lucide-react";
import { localizedSettingsError } from "@/i18n/error-messages";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InternalModelDiscoveryReviewItem } from "@/lib/fetchers/internal/fetchInternalModelDiscoveryReviews";
import { reviewModelDiscoveryItemAction } from "@/app/(dashboard)/settings/internal/model-discovery/actions";

type Props = { initialItems: InternalModelDiscoveryReviewItem[] };

function statusTone(status: InternalModelDiscoveryReviewItem["status"]): string {
	if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
	if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300";
	if (status === "snoozed") return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
	return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
}

function modelSearchUrl(item: InternalModelDiscoveryReviewItem): string {
	return `/internal/data/models?q=${encodeURIComponent(`${item.provider_id}/${item.model_id}`)}`;
}

function formatDate(value: string, locale: string): string {
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date.toLocaleString(locale) : value;
}

export default function ModelDiscoveryReviewClient({ initialItems }: Props) {
	const t = useTranslations("SettingsUI");
 const locale = useLocale();
 const [items, setItems] = React.useState(initialItems);
	const [reasons, setReasons] = React.useState<Record<string, string>>({});
	const [saving, setSaving] = React.useState<Set<string>>(() => new Set());

	async function decide(item: InternalModelDiscoveryReviewItem, decision: "in_progress" | "approved" | "rejected" | "snoozed") {
		const reason = reasons[item.id]?.trim();
		if ((decision === "rejected" || decision === "snoozed") && !reason) {
			toast.error(t("internalMainCopy.reasonRequired"));
			return;
		}
		setSaving((current) => new Set(current).add(item.id));
		try {
			const result = await reviewModelDiscoveryItemAction({ itemId: item.id, decision, reason });
			setItems((current) => current.map((entry) => entry.id === item.id ? result.item : entry));
			toast.success(decision === "approved" ? t("internalMainCopy.acknowledged") : decision === "in_progress" ? t("internalMainCopy.progressToast") : decision === "snoozed" ? t("internalMainCopy.snoozedToast") : t("internalMainCopy.rejectedToast"));
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Action failed", t("internalMainCopy.saveFailed")));
		} finally {
			setSaving((current) => {
				const next = new Set(current);
				next.delete(item.id);
				return next;
			});
		}
	}

	const pendingCount = items.filter((item) => item.status === "pending" || item.status === "in_progress").length;
	return (
		<div className="space-y-5">
			<div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
				<Clock3 className="mt-0.5 size-4 text-muted-foreground" />
				<div className="space-y-1 text-sm leading-6 text-muted-foreground">
					<p>{pendingCount ? t("internalMainCopy.pendingCount", { count: pendingCount }) : t("internalMainCopy.nonePending")}</p>
					<p>{t("internalMainCopy.approvalHelp")}</p>
				</div>
			</div>

			{items.length ? items.map((item) => {
				const pending = item.status === "pending" || item.status === "in_progress";
				return (
					<div key={item.id} className="rounded-xl border border-border/70 p-5">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="min-w-0 space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="font-medium">{item.model_id}</h2>
									<span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${statusTone(item.status)}`}>{item.status === "snoozed" ? t("internalMainCopy.snoozed") : t(`identity.reviewStatus.${item.status}`)}</span>
									<span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] capitalize">{t(item.change_type === "added" ? "internalMainCopy.added" : "internalMainCopy.removed")}</span>
								</div>
								<p className="font-mono text-xs text-muted-foreground">{item.provider_name} · {item.provider_id}</p>
								<p className="text-xs text-muted-foreground">{t("internalMainCopy.detectedVia", { date: formatDate(item.last_detected_at, locale), source: item.source })}</p>
								{item.review_note ? <p className="pt-1 text-sm text-muted-foreground">{item.review_note}</p> : null}
							</div>
							<Link href={modelSearchUrl(item)} className="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline">
								{t("internalMainCopy.catalogSearch")}<ExternalLink className="size-3.5" />
							</Link>
						</div>

						{pending ? (
							<div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4">
								<Input aria-label={t("internalMainCopy.reasonFor", { model: item.model_id })} value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={t("internalMainCopy.reasonPlaceholder")} className="max-w-xl text-xs" />
								<div className="flex flex-wrap gap-2">
									<Button size="sm" onClick={() => void decide(item, "approved")} disabled={saving.has(item.id)}><Check className="mr-1.5 size-3.5" /> {t("internalMainCopy.acknowledge")}</Button>
									<Button size="sm" variant="outline" onClick={() => void decide(item, "in_progress")} disabled={saving.has(item.id)}>{t("internalMainCopy.markProgress")}</Button>
									<Button size="sm" variant="outline" onClick={() => void decide(item, "snoozed")} disabled={saving.has(item.id)}>{t("internalMainCopy.snooze")}</Button>
									<Button size="sm" variant="outline" onClick={() => void decide(item, "rejected")} disabled={saving.has(item.id)}><X className="mr-1.5 size-3.5" /> {t("internalMainCopy.reject")}</Button>
								</div>
							</div>
						) : null}
					</div>
				);
			}) : (
				<div className="rounded-xl border border-dashed border-border/80 px-6 py-12 text-center">
					<p className="font-medium">{t("internalMainCopy.empty")}</p>
					<p className="mt-1 text-sm text-muted-foreground">{t("internalMainCopy.watcherHelp")}</p>
				</div>
			)}
		</div>
	);
}
