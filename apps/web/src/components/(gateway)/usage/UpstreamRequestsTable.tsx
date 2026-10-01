"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";

import type { ProviderMetadataEntry } from "@/app/(dashboard)/gateway/usage/server-actions";

import { Logo } from "@/components/Logo";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { UsageUpstreamRequestRow } from "@/lib/fetchers/internal/settingsTypes";
import { formatWordyDateTime } from "@/lib/gateway/usage/timeFormatting";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
	normalizeProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy";
import { cn } from "@/lib/utils";
import { extractUsageMeters } from "./usageMeters";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import UsageEntityHoverCard from "./UsageEntityHoverCard";

type KeyMetadata = { id: string; name: string | null; prefix: string | null };

function getModelDetailsHref(modelId: string): string | null {
	const [organisationId, ...modelParts] = modelId.split("/");
	if (!organisationId || modelParts.length === 0) return null;
	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(modelParts.join("/"))}`;
}

function maskedKeyPrefix(prefix: string | null | undefined, hiddenLabel: string): string {
	const value = prefix?.trim();
	return value ? `${value}••••••••` : hiddenLabel;
}

function formatMilliseconds(value: number | null, locale: string): string {
	return typeof value === "number" && Number.isFinite(value)
		? new Intl.NumberFormat(locale).format(Math.round(value)) + " ms"
		: "—";
}

function metadataNumber(value: unknown, key: string): number | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = (value as Record<string, unknown>)[key];
	const parsed = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

function throughputForRow(row: UsageUpstreamRequestRow): number | null {
	const supplied = metadataNumber(row.metadata, "throughput");
	if (supplied !== null) return supplied;
	const outputTokens = extractUsageMeters(row.usage)
		.filter((meter) => meter.key === "output_tokens" || meter.key === "completion_tokens")
		.reduce((sum, meter) => sum + meter.value, 0);
	const generationMs = row.generation_ms ?? row.duration_ms;
	return outputTokens > 0 && generationMs && generationMs > 0
		? outputTokens / (generationMs / 1_000)
		: null;
}

function formatThroughput(row: UsageUpstreamRequestRow, locale: string): string {
	const value = throughputForRow(row);
	return value === null
		? "—"
		: new Intl.NumberFormat(locale, { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value) + " tok/s";
}

function attemptLabel(
	row: UsageUpstreamRequestRow,
	locale: string,
	translate: (key: string, values?: Record<string, string | number>) => string,
): string {
	const attempt = row.attempt_number ?? row.internal_attempt_number ?? row.sequence;
	const count = row.attempt_count ?? 1;
	const formattedAttempt = new Intl.NumberFormat(locale).format(attempt);
	if (count <= 1) return formattedAttempt;
	return translate("strings.upstreamAttemptRange", {
		attempt: formattedAttempt,
		count: new Intl.NumberFormat(locale).format(count),
	});
}

function keySourceLabel(value: UsageUpstreamRequestRow["key_source"]): string {
	if (value === "byok") return "BYOK";
	if (value === "gateway") return "Phaseo";
	return "—";
}

function formatUpstreamOutcome(
	outcome: string,
	translate: (key: string) => string,
): string {
	switch (outcome.trim().toLowerCase()) {
		case "success":
		case "succeeded":
			return translate("strings.upstreamOutcomeSuccess");
		case "error":
		case "failed":
			return translate("strings.upstreamOutcomeError");
		case "generation":
			return translate("strings.upstreamOutcomeGeneration");
		default:
			return outcome;
	}
}
function jsonText(value: unknown, emptyLabel: string): string {
	if (value == null) return emptyLabel;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="min-w-0 border-b border-border/60 py-3 last:border-b-0">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 min-w-0 break-words text-sm font-medium text-foreground">{value}</div>
		</div>
	);
}

function PayloadSection({ title, value, emptyLabel }: { title: string; value: unknown; emptyLabel: string }) {
	return (
		<section className="space-y-2">
			<h3 className="text-sm font-semibold">{title}</h3>
			<pre className="max-h-80 overflow-auto rounded-lg border border-border/70 bg-muted/25 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
				{jsonText(value, emptyLabel)}
			</pre>
		</section>
	);
}

export default function UpstreamRequestsTable({
	rows,
	modelMetadata,
	providerNames,
	providerMetadata,
	keys,
}: {
	rows: UsageUpstreamRequestRow[];
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
	providerMetadata: Map<string, ProviderMetadataEntry>;
	keys: Map<string, KeyMetadata>;
}) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const translate = (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
	const [selected, setSelected] = React.useState<UsageUpstreamRequestRow | null>(null);

	return (
		<>
			<div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/70">
				<ScrollArea
					className="w-full"
					scrollBarOrientation="horizontal"
					keepScrollbarMounted
					viewportClassName="w-full pb-2"
				>
					<Table wrapInContainer={false} className="min-w-[1080px] whitespace-nowrap text-xs">
						<TableHeader>
							<TableRow className="h-9">
								<TableHead>{t("strings.Date" as never)}</TableHead>
								<TableHead>{t("strings.Model" as never)}</TableHead>
								<TableHead>{t("strings.Provider" as never)}</TableHead>
								<TableHead>{t("strings.Source" as never)}</TableHead>
								<TableHead>{t("strings.Generation ID" as never)}</TableHead>
								<TableHead>{t("strings.Status" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Attempts" as never)}</TableHead>
								<TableHead>{t("strings.Key used" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Throughput" as never)}</TableHead>
								<TableHead className="text-right">{t("strings.Latency" as never)}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.length === 0 ? (
								<TableRow>
									<TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
										{t("strings.No upstream requests in this period." as never)}
									</TableCell>
								</TableRow>
							) : rows.map((row) => {
								const modelLabel = getModelDisplayName(row.model_id, modelMetadata);
								const model = modelMetadata.get(row.model_id);
								const provider = row.provider ? providerMetadata.get(row.provider) : null;
								const providerPolicy = provider
									? PROVIDER_PROMPT_TRAINING_POLICY_LABELS[
										normalizeProviderPromptTrainingPolicy(provider.promptTrainingPolicy)
									]
									: null;
								const key = row.key_id ? keys.get(row.key_id) : null;
								const keyLabel = key?.name?.trim() || keySourceLabel(row.key_source);
								const providerLabel = row.provider ? providerNames.get(row.provider) ?? row.provider : "—";
								return (
									<TableRow
										key={`${row.id}-${row.created_at}`}
										role="button"
										tabIndex={0}
										className="cursor-pointer"
										onClick={() => setSelected(row)}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												setSelected(row);
											}
										}}
									>
										<TableCell className="font-mono">{formatWordyDateTime(row.created_at, { includeTime: true, locale })}</TableCell>
									<TableCell>
										<UsageEntityHoverCard
											title={modelLabel}
											subtitle={model?.organisationName}
											href={getModelDetailsHref(row.model_id)}
											visual={model?.organisationId ? <Logo id={model.organisationId} width={18} height={18} /> : null}
											rows={[{ label: "Model ID", value: <code className="font-mono text-[11px]">{row.model_id}</code> }]}
										>
											<span className="flex max-w-[230px] items-center gap-2">
												{model?.organisationId ? <Logo id={model.organisationId} width={15} height={15} /> : null}
												<span className="truncate" title={modelLabel}>{modelLabel}</span>
											</span>
										</UsageEntityHoverCard>
									</TableCell>
									<TableCell>
										{row.provider ? (
											<UsageEntityHoverCard
												title={providerLabel}
												subtitle={providerPolicy}
												href={`/api-providers/${encodeURIComponent(row.provider)}`}
												visual={<Logo id={row.provider} width={18} height={18} />}
												rows={[]}
											>
												<span className="inline-flex items-center gap-2">
													<Logo id={row.provider} width={15} height={15} />
													{providerLabel}
												</span>
											</UsageEntityHoverCard>
										) : providerLabel}
									</TableCell>
									<TableCell>{row.client_source_name ?? row.client_source_id ?? t("strings.upstreamDirectHttp" as never)}</TableCell>
										<TableCell className="max-w-[210px] truncate font-mono" title={row.request_id}>{row.request_id}</TableCell>
										<TableCell>
											<Badge variant="outline" className={cn("gap-1", row.success ? "border-emerald-500/30 text-emerald-600" : "border-rose-500/30 text-rose-600")}>
												{row.success ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
												{row.status_code ?? formatUpstreamOutcome(row.outcome, translate)}
											</Badge>
										</TableCell>
									<TableCell className="text-right font-mono">{attemptLabel(row, locale, translate)}</TableCell>
									<TableCell>
										<UsageEntityHoverCard
											title={keyLabel}
											subtitle={key ? maskedKeyPrefix(key.prefix, t("strings.upstreamKeyValueHidden" as never)) : row.key_source === "byok" ? t("strings.upstreamBringYourOwnKey" as never) : t("strings.upstreamPhaseoManagedProviderKey" as never)}
											href={key ? "/settings/keys" : null}
											visual={<KeyRound className="size-4 text-muted-foreground" />}
											rows={key ? [{ label: t("strings.Source" as never), value: keySourceLabel(row.key_source) }] : []}
										>
											<span className="inline-flex items-center gap-1.5"><KeyRound className="size-3.5 text-muted-foreground" />{keyLabel}</span>
										</UsageEntityHoverCard>
									</TableCell>
										<TableCell className="text-right font-mono">{formatThroughput(row, locale)}</TableCell>
										<TableCell className="text-right font-mono">{formatMilliseconds(row.latency_ms ?? row.duration_ms, locale)}</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</ScrollArea>
			</div>

			<ProviderInspectorSheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
				<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[58vw] lg:!w-[52vw] xl:!w-[48vw] 2xl:!w-[44vw] data-[side=right]:sm:max-w-none">
					{selected ? (
						<>
							<ProviderInspectorSheetHeader className="border-b border-border/70 px-5 py-4 pr-14">
								<ProviderInspectorSheetTitle className="flex items-center gap-2">
									{selected.provider ? <Logo id={selected.provider} width={18} height={18} /> : null}
									{selected.provider ? providerNames.get(selected.provider) ?? selected.provider : t("strings.upstreamRequestTitle" as never)}
								</ProviderInspectorSheetTitle>
								<ProviderInspectorSheetDescription className="font-mono text-xs">{selected.request_id}</ProviderInspectorSheetDescription>
							</ProviderInspectorSheetHeader>
							<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
								<div className="grid grid-cols-2 gap-x-5">
									<DetailField label={t("strings.Model" as never)} value={getModelDisplayName(selected.model_id, modelMetadata)} />
									<DetailField label={t("strings.upstreamProviderModel" as never)} value={selected.provider_model_slug ?? selected.api_model_id ?? "—"} />
									<DetailField label={t("strings.Source" as never)} value={selected.client_source_name ?? selected.client_source_id ?? t("strings.upstreamDirectHttp" as never)} />
									<DetailField label={t("strings.Status" as never)} value={selected.status_code ?? formatUpstreamOutcome(selected.outcome, translate)} />
									<DetailField label={t("strings.upstreamAttempt" as never)} value={attemptLabel(selected, locale, translate)} />
									<DetailField label={t("strings.Key used" as never)} value={keySourceLabel(selected.key_source)} />
									<DetailField label={t("strings.Throughput" as never)} value={formatThroughput(selected, locale)} />
									<DetailField label={t("strings.Latency" as never)} value={formatMilliseconds(selected.latency_ms ?? selected.duration_ms, locale)} />
									<DetailField label={t("strings.upstreamTotalTime" as never)} value={formatMilliseconds(selected.total_ms, locale)} />
									<DetailField label={t("strings.Outcome" as never)} value={formatUpstreamOutcome(selected.outcome, translate)} />
									<DetailField label={t("strings.upstreamFinishReason" as never)} value={selected.provider_finish_reason ?? selected.finish_reason ?? "—"} />
								</div>
								{selected.error_message ? (
									<div className="my-4 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 text-sm text-rose-600">
										<div className="font-medium">{selected.error_code ?? selected.error_type ?? t("strings.upstreamError" as never)}</div>
										<div className="mt-1">{selected.error_message}</div>
									</div>
								) : null}
								<Separator className="my-5" />
								<div className="space-y-5">
									<PayloadSection title={t("strings.Request payload" as never)} value={selected.request_payload} emptyLabel={t("strings.upstreamNoDataCaptured" as never)} />
									<PayloadSection title={t("strings.Response payload" as never)} value={selected.response_payload} emptyLabel={t("strings.upstreamNoDataCaptured" as never)} />
									<PayloadSection title={t("strings.Usage" as never)} value={selected.usage} emptyLabel={t("strings.upstreamNoDataCaptured" as never)} />
									<PayloadSection title={t("strings.Metadata" as never)} value={selected.metadata} emptyLabel={t("strings.upstreamNoDataCaptured" as never)} />
								</div>
							</div>
						</>
					) : null}
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>
		</>
	);
}
