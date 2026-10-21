"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import {
	CLASSIFIER_CALL_LABEL_KEY,
	classifierDimensionsByKey,
	formatUsd,
	type RequestClassifierSummary,
} from "./requestClassifierLabels";

type Label = { key: string; value: string };
type ClassifiedLabel = Label & { confidence: number | null };
export type ClassificationStatus = "classified" | "session_cache" | "failed" | "budget_reached";
export type RequestClassification = {
	classifierId: string;
	status: ClassificationStatus;
	model: string | null;
	labels: ClassifiedLabel[];
	responseId: string | null;
	costNanos: number | null;
};

const STATUSES = new Set<ClassificationStatus>(["classified", "session_cache", "failed", "budget_reached"]);

function asText(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Reads detail_metadata.labels, keeping well-formed string labels only. */
export function readRequestLabels(detailMetadata: unknown): Label[] {
	const metadata = (detailMetadata && typeof detailMetadata === "object" ? detailMetadata : {}) as Record<string, unknown>;
	return (Array.isArray(metadata.labels) ? metadata.labels : []).flatMap((raw) => {
		const label = (raw ?? {}) as Record<string, unknown>;
		const key = asText(label.key);
		const value = typeof label.value === "string" ? label.value : null;
		return key && value != null ? [{ key, value }] : [];
	});
}

/** Reads detail_metadata.classifications as the gateway writes them, dropping anything malformed. */
export function readRequestClassifications(detailMetadata: unknown): RequestClassification[] {
	const metadata = (detailMetadata && typeof detailMetadata === "object" ? detailMetadata : {}) as Record<string, unknown>;
	return (Array.isArray(metadata.classifications) ? metadata.classifications : []).flatMap((raw) => {
		const outcome = (raw ?? {}) as Record<string, unknown>;
		const classifierId = asText(outcome.classifier_id);
		const status = outcome.status as ClassificationStatus;
		if (!classifierId || !STATUSES.has(status)) return [];
		const labels = (Array.isArray(outcome.labels) ? outcome.labels : []).flatMap((entry) => {
			const label = (entry ?? {}) as Record<string, unknown>;
			const key = asText(label.key);
			const value = typeof label.value === "string" ? label.value : null;
			const confidence = typeof label.confidence === "number" && Number.isFinite(label.confidence) ? label.confidence : null;
			return key && value != null ? [{ key, value, confidence }] : [];
		});
		const cost = Number(outcome.cost_nanos);
		return [{
			classifierId,
			status,
			model: asText(outcome.model),
			labels,
			responseId: asText(outcome.response_id),
			costNanos: outcome.cost_nanos == null || !Number.isFinite(cost) ? null : cost,
		}];
	});
}

/**
 * Labels and classifier answers on one request: what the caller sent, what
 * each classifier answered (with confidence, status, model, cost and a link to
 * the classifier call), or, on a classifier call itself, which classifier it ran.
 */
export default function RequestClassificationsSection({
	detailMetadata,
	classifiers = [],
}: {
	detailMetadata: unknown;
	classifiers?: RequestClassifierSummary[];
}) {
	const t = useTranslations("SettingsUI.requestClassifierUsage");
	const locale = useLocale();
	const searchParams = useSearchParams();
	const labels = readRequestLabels(detailMetadata);
	const classifications = readRequestClassifications(detailMetadata);
	if (!labels.length && !classifications.length) return null;

	const names = new Map(classifiers.map((classifier) => [classifier.id, classifier.name]));
	const dimensions = classifierDimensionsByKey(classifiers);
	const classifierCallFor = labels.find((label) => label.key === CLASSIFIER_CALL_LABEL_KEY)?.value ?? null;
	const classifiedKeys = new Set(classifications.flatMap((outcome) => outcome.labels.map((label) => `${label.key}\u0000${label.value}`)));
	const callerLabels = labels.filter((label) => label.key !== CLASSIFIER_CALL_LABEL_KEY && !classifiedKeys.has(`${label.key}\u0000${label.value}`));
	const dimensionName = (key: string) => dimensions.get(key)?.dimension.name ?? key;
	const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
	const statusText: Record<ClassificationStatus, string> = {
		classified: t("statusClassified"),
		session_cache: t("statusSessionCache"),
		budget_reached: t("statusBudgetReached"),
		failed: t("statusFailed"),
	};
	const callHref = (responseId: string) => {
		const query = searchParams?.toString();
		return `/settings/usage/logs/requests/${encodeURIComponent(responseId)}${query ? `?${query}` : ""}`;
	};

	return (
		<section className="border-b border-border/70 py-2 last:border-b-0" aria-label={t("classificationsTitle")}>
			<h2 className="mb-2 text-sm font-semibold text-foreground">
				{classifications.length ? t("classificationsTitle") : t("labelsTitle")}
			</h2>
			<div className="space-y-3 text-sm">
				{classifierCallFor ? (
					<p className="flex items-center gap-1.5 text-muted-foreground">
						<Sparkles className="size-3.5 shrink-0" aria-hidden />
						{t("thisIsClassifierCall", { name: names.get(classifierCallFor) ?? classifierCallFor })}
					</p>
				) : null}
				{classifications.map((outcome, index) => (
					<div key={`${outcome.classifierId}-${index}`} className="space-y-1.5 border-l-2 border-border pl-3">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<Sparkles className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
							<span className="font-medium">{names.get(outcome.classifierId) ?? outcome.classifierId}</span>
							<span className={outcome.status === "failed" || outcome.status === "budget_reached" ? "text-xs text-amber-700 dark:text-amber-400" : "text-xs text-muted-foreground"}>
								{statusText[outcome.status]}
							</span>
						</div>
						{outcome.labels.length ? (
							<dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
								{outcome.labels.map((label) => (
									<div key={`${label.key}\u0000${label.value}`} className="contents">
										<dt className="text-[11px] leading-5 text-muted-foreground" title={label.key}>{dimensionName(label.key)}</dt>
										<dd className="min-w-0 truncate">
											<span>{label.value}</span>
											{label.confidence != null ? (
												<span className="ml-2 text-xs text-muted-foreground">{t("confidence", { value: percent.format(label.confidence) })}</span>
											) : null}
										</dd>
									</div>
								))}
							</dl>
						) : outcome.status === "classified" || outcome.status === "session_cache" ? (
							<p className="text-xs text-muted-foreground">{t("noAnswer")}</p>
						) : null}
						<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
							{outcome.model ? <span>{t("model")}: <span className="font-mono">{outcome.model}</span></span> : null}
							{outcome.costNanos != null ? <span>{t("cost")}: <span className="font-mono">{formatUsd(outcome.costNanos)}</span></span> : null}
							{outcome.responseId ? (
								<Link href={callHref(outcome.responseId)} className="underline underline-offset-2 hover:text-foreground">
									{t("openClassifierCall")}
								</Link>
							) : null}
						</div>
					</div>
				))}
				{callerLabels.length ? (
					<div className="space-y-1">
						{classifications.length ? <p className="text-[11px] text-muted-foreground">{t("callerLabels")}</p> : null}
						<dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
							{callerLabels.map((label) => (
								<div key={`${label.key}\u0000${label.value}`} className="contents">
									<dt className="font-mono text-[11px] leading-5 text-muted-foreground">{label.key}</dt>
									<dd className="min-w-0 truncate">{label.value}</dd>
								</div>
							))}
						</dl>
					</div>
				) : null}
			</div>
		</section>
	);
}
