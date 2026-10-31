"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import {
	CLASSIFIER_CALL_LABEL_KEY,
	classifierDimensionsByKey,
	formatUsd,
	labelFilterHref,
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

/** A row like the sheet's other detail rows: name on the left, value on the right. */
function LabelRow({ name, title, mono = false, children }: { name: string; title?: string; mono?: boolean; children: ReactNode }) {
	return (
		<div className="flex min-h-6 min-w-0 items-center justify-between gap-4">
			<dt className={cn("min-w-0 truncate text-[11px] leading-5 text-muted-foreground", mono && "font-mono")} title={title}>{name}</dt>
			<dd className="flex min-w-0 items-center justify-end gap-2.5 text-sm font-medium text-foreground">{children}</dd>
		</div>
	);
}

/** Confidence as a short bar and a percentage. */
function ConfidenceMeter({ value, label }: { value: number; label: string }) {
	const locale = useLocale();
	const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
	return (
		<span className="flex w-[4.5rem] shrink-0 items-center justify-end gap-1.5" title={label} aria-label={label}>
			<span className="block h-1 w-9 overflow-hidden rounded-sm bg-muted" aria-hidden>
				<span className="block h-full bg-foreground/80" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
			</span>
			<span className="w-7 text-right text-[11px] font-normal tabular-nums text-muted-foreground" aria-hidden>{percent}</span>
		</span>
	);
}

/**
 * Labels on one request, shown first in the sheet: each classifier's answers
 * (with confidence, and a quiet line for the classifier, model, cost and its
 * call), then what the caller sent. Each value opens the logs filtered to it.
 * On a classifier call itself, it says which classifier ran.
 */
export default function RequestClassificationsSection({
	detailMetadata,
	classifiers = [],
	modelName = (id) => id,
}: {
	detailMetadata: unknown;
	classifiers?: RequestClassifierSummary[];
	/** Display name for a model id. */
	modelName?: (id: string) => string;
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
	const problemText: Partial<Record<ClassificationStatus, string>> = {
		budget_reached: t("statusBudgetReached"),
		failed: t("statusFailed"),
	};
	const callHref = (responseId: string) => {
		const query = searchParams?.toString();
		return `/settings/usage/logs/requests/${encodeURIComponent(responseId)}${query ? `?${query}` : ""}`;
	};
	const valueLink = (key: string, value: string) => (
		<Link
			href={labelFilterHref(key, value, searchParams)}
			className="min-w-0 truncate underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
			title={t("showLabelled", { key: dimensionName(key), value })}
		>
			{value}
		</Link>
	);

	return (
		<section className="border-b border-border/70 py-2 last:border-b-0" aria-label={t("labelsTitle")}>
			<h2 className="mb-2 text-sm font-semibold text-foreground">{t("labelsTitle")}</h2>
			<div className="space-y-3">
				{classifierCallFor ? (
					<p className="text-sm text-muted-foreground">
						{t("thisIsClassifierCall", { name: names.get(classifierCallFor) ?? classifierCallFor })}
					</p>
				) : null}
				{classifications.map((outcome, index) => {
					const classifierName = names.get(outcome.classifierId) ?? outcome.classifierId;
					const problem = problemText[outcome.status];
					return (
						<div key={`${outcome.classifierId}-${index}`} className="space-y-1.5">
							<dl className="space-y-1.5">
								{outcome.labels.map((label) => (
									<LabelRow key={`${label.key}\u0000${label.value}`} name={dimensionName(label.key)} title={label.key}>
										{valueLink(label.key, label.value)}
										{label.confidence != null ? (
											<ConfidenceMeter value={label.confidence} label={t("confidence", { value: percent.format(label.confidence) })} />
										) : null}
									</LabelRow>
								))}
								{!outcome.labels.length ? (
									<LabelRow name={classifierName}>
										{problem ? (
											<span className="font-normal text-amber-700 dark:text-amber-400">{problem}</span>
										) : (
											<span className="font-normal text-muted-foreground">{t("noAnswer")}</span>
										)}
									</LabelRow>
								) : null}
							</dl>
							<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
								{[
									outcome.labels.length ? classifierName : null,
									outcome.labels.length && problem ? problem : null,
									outcome.status === "session_cache" ? t("statusSessionCache") : null,
									outcome.model ? modelName(outcome.model) : null,
									outcome.costNanos != null ? formatUsd(outcome.costNanos) : null,
								].filter((part): part is string => Boolean(part)).map((part, partIndex) => (
									<span key={partIndex} className="flex items-center gap-1.5">
										{partIndex > 0 ? <span aria-hidden>·</span> : null}
										<span>{part}</span>
									</span>
								))}
								{outcome.responseId ? (
									<Link href={callHref(outcome.responseId)} className="ml-auto underline underline-offset-2 hover:text-foreground">
										{t("viewCall")}
									</Link>
								) : null}
							</div>
						</div>
					);
				})}
				{callerLabels.length ? (
					<div className="space-y-1.5">
						{classifications.length ? <p className="pt-1 text-xs font-medium text-foreground">{t("callerLabels")}</p> : null}
						<dl className="space-y-1.5">
							{callerLabels.map((label) => (
								<LabelRow key={`${label.key}\u0000${label.value}`} name={label.key} mono>
									{valueLink(label.key, label.value)}
								</LabelRow>
							))}
						</dl>
					</div>
				) : null}
			</div>
		</section>
	);
}
