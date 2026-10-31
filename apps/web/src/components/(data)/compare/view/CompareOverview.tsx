"use client";

import Link from "@/components/link";
import { useTranslations } from "@/i18n/react";
import { AudioLines, Binary, CircleCheck, FileText, Image as ImageIcon, Minus, Type, Video, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompareGrid, CompareNoteRow, CompareRow, CompareSection, MODEL_COLOURS, useCompareGrid, type CompareCell } from "./CompareGrid";
import { bestIndices, priceRow, timeValue, visibleOnPhone, type Direction, type VerdictReason, type Verdicts } from "./compareViewMath";
import type { CompareViewModel, CompareViewUsageByModel } from "./types";
import { useCompareFormat, type CompareFormat } from "./useCompareFormat";

function numericCells(
	values: Array<number | null | undefined>,
	direction: Direction | null,
	render: (value: number, index: number) => React.ReactNode,
	empty: string,
	sub?: (index: number) => React.ReactNode,
): CompareCell[] {
	const best = direction ? bestIndices(values, direction) : new Set<number>();
	return values.map((value, index) => value == null
		? { content: empty, text: "", muted: true, sub: sub?.(index) }
		: { content: render(value, index), text: String(value), best: best.has(index), sub: sub?.(index) });
}

function textCells(values: Array<string | null | undefined>, empty: string): CompareCell[] {
	return values.map((value) => (value ? { content: value, text: value } : { content: empty, text: "", muted: true }));
}

/** A number with its unit in a quieter tone: "400K tokens", "1.06 s". */
function WithUnit({ value, unit }: { value: React.ReactNode; unit: string }) {
	return <>{value}<span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span></>;
}

const MODALITY_ICONS: Array<[string, LucideIcon]> = [["text", Type], ["image", ImageIcon], ["audio", AudioLines], ["video", Video], ["file", FileText]];
const AUDIO_TYPES = new Set(["audio", "speech", "music", "transcription"]);
const EMBEDDING_TYPES = new Set(["embedding", "embeddings"]);

function hasModality(types: string[], key: string): boolean {
	const lower = types.map((type) => type.toLowerCase());
	if (key === "audio") return lower.some((type) => AUDIO_TYPES.has(type));
	if (key === "file") return lower.some((type) => type === "file" || type === "pdf" || type === "document");
	if (key === "embeddings") return lower.some((type) => EMBEDDING_TYPES.has(type));
	return lower.includes(key);
}

/** One icon per modality, lit when the model supports it, like a row of indicator lights. */
function ModalityIcons({ types, format }: { types: string[]; format: CompareFormat }) {
	// Embedding vectors only get an icon when a model outputs them, so ordinary rows stay at five.
	const icons = hasModality(types, "embeddings") ? [...MODALITY_ICONS, ["embeddings", Binary] as [string, LucideIcon]] : MODALITY_ICONS;
	// A type none of the icons covers would leave the whole row dimmed, so name it instead.
	if (!icons.some(([key]) => hasModality(types, key))) return <>{format.modalities(types)}</>;
	return (
		<span className="inline-flex items-center gap-1.5" title={format.modalities(types)}>
			{icons.map(([key, Icon]) => {
				const on = hasModality(types, key);
				return (
					<span
						key={key}
						className={cn("inline-flex size-6 items-center justify-center rounded-md", on ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "text-muted-foreground/30")}
						aria-hidden
					>
						<Icon className="size-3.5" />
					</span>
				);
			})}
			<span className="sr-only">{format.modalities(types)}</span>
		</span>
	);
}

function modalityCells(models: CompareViewModel[], field: "inputTypes" | "outputTypes", format: CompareFormat, empty: string): CompareCell[] {
	return models.map((model) => {
		const types = model[field];
		if (!types.length) return { content: empty, text: "", muted: true };
		return { content: <ModalityIcons types={types} format={format} />, text: [...types].sort().join(",") };
	});
}

function Supported({ label }: { label: string }) {
	return <span className="inline-flex items-center gap-1.5"><CircleCheck aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />{label}</span>;
}

function NotListed({ label }: { label: string }) {
	return <span className="inline-flex items-center gap-1.5"><Minus aria-hidden className="size-4" />{label}</span>;
}

function reasonText(reason: VerdictReason, t: ReturnType<typeof useTranslations>, format: CompareFormat): string {
	switch (reason.type) {
		case "cheapest": return t("reasonCheapest", { value: format.usd(reason.value) });
		case "largestContext": return t("reasonLargestContext", { value: format.tokens(reason.value) });
		case "largestOutput": return t("reasonLargestOutput", { value: format.tokens(reason.value) });
		case "fastest": return t("reasonFastest", { value: format.throughput(reason.value) });
		case "lowestLatency": return t("reasonLowestLatency", { value: format.latency(reason.value) });
		case "topCapability": return t("reasonTopCapability", { value: reason.value.toFixed(1) });
		case "onlyInput": return t("reasonOnlyInput", { modalities: format.modalities(reason.modalities).toLowerCase() });
		case "mostPlans": return t("reasonMostPlans", { count: reason.value });
		case "latestCutoff": return t("reasonLatestCutoff", { value: format.monthYear(reason.value) });
		case "mostRoutes": return t("reasonMostRoutes", { count: reason.value });
	}
}

export function CompareVerdicts({ models, verdicts }: { models: CompareViewModel[]; verdicts: Verdicts }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const { phonePage } = useCompareGrid();
	if (models.length < 2) return null;
	return (
		<CompareSection id="glance" title={t("atAGlance")} description={t("atAGlanceSub")}>
			<div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(var(--verdict-columns),minmax(0,1fr))]" style={{ "--verdict-columns": models.length } as React.CSSProperties}>
				{models.map((model, index) => {
					const reasons = verdicts.byModel[model.id] ?? [];
					return (
						<div key={model.id} className={cn("rounded-md border border-border bg-card p-4 text-sm", !visibleOnPhone(index, phonePage) && "hidden sm:block")}>
							<p className="mb-2 flex items-center gap-2 font-semibold">
								<span aria-hidden className="h-4 w-1 shrink-0 rounded-sm" style={{ background: MODEL_COLOURS[index] }} />
								<span className="min-w-0">{t("chooseFor", { name: model.name })}</span>
							</p>
							{reasons.length ? (
								<ul className="space-y-1.5">
									{reasons.map((reason) => (
										<li key={reason.type} className="flex gap-2 text-muted-foreground">
											<CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
											<span>{reasonText(reason, t, format)}</span>
										</li>
									))}
								</ul>
							) : (
								<p className="text-muted-foreground">{t("noLead")}</p>
							)}
						</div>
					);
				})}
			</div>
			{verdicts.capabilityTie ? <p className="text-xs text-muted-foreground">{t("capabilityTie")}</p> : null}
		</CompareSection>
	);
}

export function CompareOverviewTable({ models }: { models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const tokens = t("tokens");
	return (
		<CompareSection id="overview" title={t("overview")}>
			<CompareGrid label={t("overview")}>
				<CompareRow
					label={t("lab")}
					cells={models.map((model): CompareCell => ({
						content: <Link href={`/organisations/${model.lab.id}`} className="underline-offset-2 hover:underline">{model.lab.name}</Link>,
						text: model.lab.id,
					}))}
				/>
				<CompareRow
					label={t("contextWindow")}
					cells={numericCells(models.map((model) => model.contextWindow?.tokens), "higher", (value) => <WithUnit value={format.compactTokens(value)} unit={tokens} />, t("notPublished"),
						(index) => (models[index]!.contextWindow?.source === "providers" ? t("fromProviders") : undefined))}
				/>
				<CompareRow
					label={t("maxOutput")}
					cells={numericCells(models.map((model) => model.maxOutput?.tokens), "higher", (value) => <WithUnit value={format.compactTokens(value)} unit={tokens} />, t("notPublished"),
						(index) => (models[index]!.maxOutput?.source === "providers" ? t("fromProviders") : undefined))}
				/>
				<CompareRow label={t("takes")} cells={modalityCells(models, "inputTypes", format, t("notPublished"))} />
				<CompareRow label={t("returns")} cells={modalityCells(models, "outputTypes", format, t("notPublished"))} />
				<CompareRow
					label={t("routes")}
					cells={numericCells(models.map((model) => model.providers.length || null), "higher", (value) => t("routeCount", { count: value }), t("noRoutes"))}
				/>
				<CompareRow
					label={t("released")}
					cells={models.map((model): CompareCell => model.releaseDate
						? { content: format.date(model.releaseDate), text: model.releaseDate }
						: { content: t("notPublished"), text: "", muted: true })}
				/>
			</CompareGrid>
		</CompareSection>
	);
}

export function ComparePerformance({ models, usage }: { models: CompareViewModel[]; usage: CompareViewUsageByModel }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const windowNote = (field: "latencyWindow" | "throughputWindow") => {
		const windows = [...new Set(models.map((model) => usage[model.id]?.[field]).filter(Boolean))];
		if (!windows.length) return undefined;
		return windows.length === 1 ? format.window(windows[0]) : t("windowMixed");
	};
	return (
		<CompareSection id="performance" title={t("performance")} description={t("onPhaseoSource")}>
			<CompareGrid label={t("performance")}>
				<CompareRow
					label={t("latency")}
					labelSub={windowNote("latencyWindow")}
					cells={numericCells(models.map((model) => usage[model.id]?.latencyP50Ms30m), "lower", (value) => format.latency(value), t("noTraffic"))}
				/>
				<CompareRow
					label={t("throughput")}
					labelSub={windowNote("throughputWindow")}
					cells={numericCells(models.map((model) => usage[model.id]?.throughputP50TokPerSec30m), "higher", (value) => format.throughput(value), t("noTraffic"))}
				/>
				<CompareRow
					label={t("requests24h")}
					cells={numericCells(models.map((model) => usage[model.id]?.totalRequests || null), null, (value) => format.tokens(value), t("noTraffic"))}
				/>
			</CompareGrid>
		</CompareSection>
	);
}

export function CompareFeatures({ models, priced, tiers }: { models: CompareViewModel[]; priced: CompareViewModel[]; tiers: string[] }) {
	const t = useTranslations("Catalogue.compareView");
	const flag = (key: keyof CompareViewModel["features"]) =>
		models.map((model): CompareCell => {
			const value = model.features[key];
			if (value == null) return { content: t("noRouteData"), text: "", muted: true };
			return value ? { content: <Supported label={t("yes")} />, text: "yes" } : { content: <NotListed label={t("notListed")} />, text: "no", muted: true };
		});
	return (
		<CompareSection id="features" title={t("features")} description={t("featuresGroupSource")}>
			<CompareGrid label={t("features")}>
				<CompareRow label={t("tools")} cells={flag("tools")} />
				<CompareRow label={t("structuredOutputs")} cells={flag("structuredOutputs")} />
				<CompareRow label={t("reasoning")} cells={flag("reasoning")} />
				<CompareRow label={t("webSearch")} cells={flag("webSearch")} />
				<CompareRow
					label={t("promptCaching")}
					labelSub={t("onChosenRoute")}
					cells={priced.map((model, index): CompareCell => {
						if (!model.pricing) return { content: t("notPriced"), text: "", muted: true };
						return priceRow(model, "cacheRead", tiers[index])
							? { content: <Supported label={t("yes")} />, text: "yes" }
							: { content: <NotListed label={t("notListed")} />, text: "no", muted: true };
					})}
				/>
				<CompareRow
					label={t("quantisation")}
					labelSub={t("onChosenRoute")}
					cells={priced.map((model, index): CompareCell => {
						const routeId = model.pricing?.provider.id;
						const quantisation = models[index]!.providers.find((route) => route.id === routeId)?.quantisation;
						return quantisation ? { content: quantisation, text: quantisation } : { content: t("notStated"), text: "", muted: true };
					})}
				/>
			</CompareGrid>
		</CompareSection>
	);
}

export function CompareDetails({ models }: { models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const { differencesOnly } = useCompareGrid();
	return (
		<CompareSection id="details" title={t("details")}>
			<CompareGrid label={t("details")}>
				<CompareRow
					label={t("knowledgeCutoff")}
					cells={numericCells(models.map((model) => timeValue(model.knowledgeCutoff)), "higher",
						(_, index) => format.monthYear(models[index]!.knowledgeCutoff!), t("notPublished"))}
				/>
				<CompareRow label={t("status")} cells={textCells(models.map((model) => format.status(model.status)), t("notPublished"))} />
				<CompareRow label={t("licence")} cells={textCells(models.map((model) => model.licence), t("notPublished"))} />
				<CompareRow
					label={t("subscriptionPlans")}
					cells={models.map((model): CompareCell => model.subscriptionPlans.length
						? {
							content: t("planCount", { count: model.subscriptionPlans.length }),
							text: String(model.subscriptionPlans.length),
							sub: model.subscriptionPlans.slice(0, 3).map((plan) => plan.name).join(", ") + (model.subscriptionPlans.length > 3 ? "…" : ""),
						}
						: { content: t("noPlans"), text: "", muted: true })}
				/>
				<CompareRow
					label={t("docs")}
					cells={models.map((model): CompareCell => model.links.apiReference
						? {
							content: <a href={model.links.apiReference} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t("openDocs")}</a>,
							text: model.links.apiReference,
						}
						: { content: t("notPublished"), text: "", muted: true })}
				/>
				{differencesOnly ? <CompareNoteRow>{t("sameRowsHidden")}</CompareNoteRow> : null}
			</CompareGrid>
		</CompareSection>
	);
}
