"use client";

import { Ban, Flag, Scissors, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GuardrailEnforcementMetricsResult } from "@/lib/gateway/usage/guardrailEnforcementMetrics";

interface GuardrailEnforcementPanelProps {
	metrics: GuardrailEnforcementMetricsResult;
}

export default function GuardrailEnforcementPanel({
	metrics,
}: GuardrailEnforcementPanelProps) {
	const t = useTranslations("SettingsUI");
	const format = useDisplayFormatters();
	const formatCount = (value: number) =>
		format.number(value, { maximumFractionDigits: 0, notation: "standard" });
	const trendMax = Math.max(
		1,
		...metrics.buckets.map((bucket) => bucket.total),
	);
	const hasEvents =
		metrics.totals.blocked > 0 ||
		metrics.totals.redacted > 0 ||
		metrics.totals.flagged > 0;
	const missingSignalsMessage =
		!metrics.signalsRecorded.redacted && !metrics.signalsRecorded.flagged
			? t("strings.guardrailBothSignalsPending" as never)
			: !metrics.signalsRecorded.redacted
				? t("strings.guardrailRedactionSignalPending" as never)
				: !metrics.signalsRecorded.flagged
					? t("strings.guardrailFlagSignalPending" as never)
					: null;

	return (
		<Card>
			<CardHeader className="pb-4">
				<div className="flex items-start gap-3">
					<div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700">
						<ShieldAlert className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<CardTitle>{t("strings.Guardrail enforcement" as never)}</CardTitle>
						<p className="text-sm text-muted-foreground">
							{t("strings.phraseTracksRequestsBlockedRedactedOrFlaggedByWorkspacePolicyAndGuardrailEnforcementSignals" as never)}
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid gap-3 md:grid-cols-3">
					<div className="rounded-xl border border-rose-200/70 bg-rose-50/70 p-4">
						<div className="flex items-center gap-2 text-sm font-medium text-rose-900">
							<Ban className="h-4 w-4" />
							{t("strings.Blocked" as never)}
						</div>
						<div className="mt-2 text-2xl font-semibold text-rose-950">
							{formatCount(metrics.totals.blocked)}
						</div>
					</div>
					<div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-4">
						<div className="flex items-center gap-2 text-sm font-medium text-amber-900">
							<Scissors className="h-4 w-4" />
							{t("strings.Redacted" as never)}
						</div>
						<div className="mt-2 text-2xl font-semibold text-amber-950">
							{formatCount(metrics.totals.redacted)}
						</div>
					</div>
					<div className="rounded-xl border border-sky-200/70 bg-sky-50/70 p-4">
						<div className="flex items-center gap-2 text-sm font-medium text-sky-900">
							<Flag className="h-4 w-4" />
							{t("strings.Flagged" as never)}
						</div>
						<div className="mt-2 text-2xl font-semibold text-sky-950">
							{formatCount(metrics.totals.flagged)}
						</div>
					</div>
				</div>

				<div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(260px,1fr)]">
					<div className="space-y-3">
						<div className="text-sm font-medium">{t("strings.Trend" as never)}</div>
						{hasEvents ? (
							<div className="space-y-2">
								{metrics.buckets
									.filter((bucket) => bucket.total > 0)
									.map((bucket) => (
										<div
											key={bucket.bucket}
											className="rounded-xl border border-border/60 bg-muted/20 p-3"
										>
											<div className="flex items-center justify-between gap-4">
												<div className="text-sm font-medium">{bucket.label}</div>
											<div className="font-mono text-xs text-muted-foreground">
													{bucket.blocked} {t("strings.Blocked" as never)} / {bucket.redacted} {t("strings.Redacted" as never)} /{" "}
													{bucket.flagged} {t("strings.Flagged" as never)}
												</div>
											</div>
											<div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-rose-500"
													style={{
														width: `${Math.max(
															8,
															(bucket.total / trendMax) * 100,
														)}%`,
													}}
												/>
											</div>
										</div>
									))}
							</div>
						) : (
							<div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
								{t("strings.phraseNoGuardrailEnforcementEventsWereRecordedInThisWindow" as never)}
							</div>
						)}
					</div>

					<div className="space-y-3">
						<div className="text-sm font-medium">{t("strings.Most active guardrails" as never)}</div>
						{metrics.topGuardrails.length > 0 ? (
							<div className="space-y-2">
								{metrics.topGuardrails.map((guardrail) => (
									<div
										key={guardrail.id}
										className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
									>
										<code className="text-xs">{guardrail.id}</code>
										<span className="font-mono text-xs text-muted-foreground">
											{guardrail.count}
										</span>
									</div>
								))}
							</div>
						) : (
							<div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
								{t("strings.phraseNoGuardrailIDsWereAttachedToTheCurrentEnforcementEvents" as never)}
							</div>
						)}

						{missingSignalsMessage ? (
							<div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
								{missingSignalsMessage}
							</div>
						) : null}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
