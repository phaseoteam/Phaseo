"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import type { ProviderMetadataEntry } from "@/app/(dashboard)/gateway/usage/server-actions";

import ConfigurableLogTable from "./ConfigurableLogTable";
import { UPSTREAM_COLUMNS } from "./logColumns";
import {
	groupUpstreamGenerations,
	type UpstreamGeneration,
} from "./upstreamGenerations";
import { Logo } from "@/components/Logo";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { Badge } from "@/components/ui/badge";
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

function maskedKeyPrefix(prefix: string | null | undefined): string {
	const value = prefix?.trim();
	return value ? `${value}••••••••` : "Key value hidden";
}

function formatMilliseconds(value: number | null): string {
	return typeof value === "number" && Number.isFinite(value)
		? `${Math.round(value).toLocaleString()} ms`
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
		.filter(
			(meter) =>
				meter.key === "output_tokens" || meter.key === "completion_tokens",
		)
		.reduce((sum, meter) => sum + meter.value, 0);
	const generationMs = row.generation_ms ?? row.duration_ms;
	return outputTokens > 0 && generationMs && generationMs > 0
		? outputTokens / (generationMs / 1_000)
		: null;
}

function formatThroughput(row: UsageUpstreamRequestRow): string {
	const value = throughputForRow(row);
	return value === null ? "—" : `${value.toFixed(value >= 100 ? 0 : 1)} tok/s`;
}

function attemptLabel(row: UsageUpstreamRequestRow): string {
	const attempt =
		row.attempt_number ?? row.internal_attempt_number ?? row.sequence;
	return row.attempt_count && row.attempt_count > 1
		? `${attempt} of ${row.attempt_count}`
		: String(attempt);
}

function keySourceLabel(value: UsageUpstreamRequestRow["key_source"]): string {
	if (value === "byok") return "BYOK";
	if (value === "gateway") return "Phaseo";
	return "—";
}

function jsonText(value: unknown): string {
	if (value == null) return "No data captured.";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function DetailField({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="min-w-0 border-b border-border/60 py-3 last:border-b-0">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 min-w-0 break-words text-sm font-medium text-foreground">
				{value}
			</div>
		</div>
	);
}

function PayloadSection({ title, value }: { title: string; value: unknown }) {
	return (
		<section className="space-y-2">
			<h3 className="text-sm font-semibold">{title}</h3>
			<pre className="max-h-80 overflow-auto rounded-lg border border-border/70 bg-muted/25 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
				{jsonText(value)}
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
	settingsTargetId,
}: {
	settingsTargetId?: string;
	rows: UsageUpstreamRequestRow[];
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
	providerMetadata: Map<string, ProviderMetadataEntry>;
	keys: Map<string, KeyMetadata>;
}) {
	const [selected, setSelected] = React.useState<UpstreamGeneration | null>(
		null,
	);

	const [inspectedAttemptId, setInspectedAttemptId] = React.useState<string | null>(null);
	const inspected = selected?.attempts.find((attempt) => attempt.id === inspectedAttemptId) ?? selected;

	return (
		<>
			<ConfigurableLogTable
				tableId="upstream"
				label="upstream requests"
				definitions={UPSTREAM_COLUMNS}
				rows={groupUpstreamGenerations(rows)}
				rowKey={(row) => row.gateway_request_id || row.request_id}
				settingsTargetId={settingsTargetId}
				onRowClick={(row) => { setSelected(row); setInspectedAttemptId(null); }}
				emptyMessage="No upstream requests in this period."
				renderCell={(row, column) => {
					const modelLabel = getModelDisplayName(row.model_id, modelMetadata);
					const model = modelMetadata.get(row.model_id);
					const provider = row.provider
						? providerMetadata.get(row.provider)
						: null;
					const providerPolicy = provider
						? PROVIDER_PROMPT_TRAINING_POLICY_LABELS[
								normalizeProviderPromptTrainingPolicy(
									provider.promptTrainingPolicy,
								)
							]
						: null;
					const providerLabel = row.provider
						? (providerNames.get(row.provider) ?? row.provider)
						: "—";

					switch (column) {
						case "date":
							return (
								<>
									{formatWordyDateTime(row.created_at, { includeTime: true })}
								</>
							);
						case "model":
							return (
								<>
									<UsageEntityHoverCard
										title={modelLabel}
										subtitle={model?.organisationName}
										href={getModelDetailsHref(row.model_id)}
										visual={
											model?.organisationId ? (
												<Logo
													id={model.organisationId}
													width={18}
													height={18}
												/>
											) : null
										}
										rows={[
											{
												label: "Model ID",
												value: (
													<code className="font-mono text-[11px]">
														{row.model_id}
													</code>
												),
											},
										]}
									>
										<span className="flex max-w-[230px] items-center gap-2">
											{model?.organisationId ? (
												<Logo
													id={model.organisationId}
													width={15}
													height={15}
												/>
											) : null}
											<span className="truncate" title={modelLabel}>
												{modelLabel}
											</span>
										</span>
									</UsageEntityHoverCard>
								</>
							);
						case "provider":
							return (
								<>
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
									) : (
										providerLabel
									)}
								</>
							);
						case "generation":
							return <>{row.request_id}</>;
						case "status":
							return (
								<>
									<Badge
										variant="outline"
										className={cn(
											"gap-1",
											row.success
												? "border-emerald-500/30 text-emerald-600"
												: "border-rose-500/30 text-rose-600",
										)}
									>
										{row.success ? (
											<CheckCircle2 className="size-3" />
										) : (
											<XCircle className="size-3" />
										)}
										{row.status_code ?? row.outcome}
									</Badge>
								</>
							);
						case "attempts":
							return row.totalAttempts;
						case "latency":
							return formatMilliseconds(row.request_latency_ms ?? null);
					}
				}}
			/>

			<ProviderInspectorSheet
				open={selected !== null}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
			>
				<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[58vw] lg:!w-[52vw] xl:!w-[48vw] 2xl:!w-[44vw] data-[side=right]:sm:max-w-none">
					{selected && inspected ? (
						<>
							<ProviderInspectorSheetHeader className="border-b border-border/70 px-5 py-4 pr-14">
								<ProviderInspectorSheetTitle className="flex items-center gap-2">
									{inspected.provider ? (
										<Logo id={inspected.provider} width={18} height={18} />
									) : null}
									{inspected.provider
										? (providerNames.get(inspected.provider) ??
											inspected.provider)
										: "Upstream request"}
								</ProviderInspectorSheetTitle>
								<ProviderInspectorSheetDescription className="font-mono text-xs">
									{inspected.request_id}
								</ProviderInspectorSheetDescription>
							</ProviderInspectorSheetHeader>
							<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
								<div className="grid grid-cols-2 gap-x-5">
									<DetailField
										label="Model"
										value={getModelDisplayName(
											inspected.model_id,
											modelMetadata,
										)}
									/>
									<DetailField
										label="Provider model"
										value={
											inspected.provider_model_slug ??
											inspected.api_model_id ??
											"—"
										}
									/>
									<DetailField
										label="Source"
										value={
											inspected.client_source_name ??
											inspected.client_source_id ??
											"Direct HTTP"
										}
									/>
									<DetailField
										label="Status"
										value={inspected.status_code ?? inspected.outcome}
									/>
									<DetailField label="Attempt" value={attemptLabel(inspected)} />
									<DetailField
										label="Key used"
										value={
											inspected.key_id
												? (keys.get(inspected.key_id)?.name ??
													keySourceLabel(inspected.key_source))
												: keySourceLabel(inspected.key_source)
										}
									/>
									<DetailField
										label="Key prefix"
										value={maskedKeyPrefix(
											inspected.key_id
												? keys.get(inspected.key_id)?.prefix
												: null,
										)}
									/>
									<DetailField
										label="Throughput"
										value={formatThroughput(inspected)}
									/>
									<DetailField
										label="Latency"
										value={formatMilliseconds(
											inspected.latency_ms ?? inspected.duration_ms,
										)}
									/>
									<DetailField
										label="Total time"
										value={formatMilliseconds(inspected.total_ms)}
									/>
									<DetailField label="Outcome" value={inspected.outcome} />
									<DetailField
										label="Finish reason"
										value={
											inspected.provider_finish_reason ??
											inspected.finish_reason ??
											"—"
										}
									/>
								</div>
								{inspected.error_message ? (
									<div className="my-4 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 text-sm text-rose-600">
										<div className="font-medium">
											{inspected.error_code ??
												inspected.error_type ??
												"Upstream error"}
										</div>
										<div className="mt-1">{inspected.error_message}</div>
									</div>
								) : null}
								<section className="my-5 space-y-2">
									<h3 className="text-sm font-semibold">Attempts</h3>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Attempt</TableHead>
												<TableHead>Provider</TableHead>
												<TableHead>Status</TableHead>
												<TableHead>Latency</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{[...selected.attempts].reverse().map((attempt) => (
												<TableRow key={attempt.id}>
													<TableCell><button type="button" className="cursor-pointer underline underline-offset-4" aria-label={`Inspect attempt ${attempt.sequence}`} aria-pressed={inspected.id === attempt.id} onClick={() => setInspectedAttemptId(attempt.id)}>{attempt.sequence}</button></TableCell>
													<TableCell>
														{attempt.provider
															? (providerNames.get(attempt.provider) ??
																attempt.provider)
															: "—"}
													</TableCell>
													<TableCell>
														{attempt.status_code ?? attempt.outcome}
													</TableCell>
													<TableCell>
														{formatMilliseconds(
															attempt.latency_ms ?? attempt.duration_ms,
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</section>
								<Separator className="my-5" />
								<div className="space-y-5">
									<PayloadSection
										title="Request payload"
										value={inspected.request_payload}
									/>
									<PayloadSection
										title="Response payload"
										value={inspected.response_payload}
									/>
									<PayloadSection title="Usage" value={inspected.usage} />
									<PayloadSection title="Metadata" value={inspected.metadata} />
								</div>
							</div>
						</>
					) : null}
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>
		</>
	);
}
