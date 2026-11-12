import Link from "@/components/link";
import { useTranslations } from "@/i18n/react";
import { AudioLines, CircleCheck, FileText, Image as ImageIcon, Minus, Type, Video, type LucideIcon } from "lucide-react";
import { getModalityIcon } from "@/components/(data)/models/Models/modalityIcons";
import { useModalityLabel } from "@/components/(data)/models/Models/useModalityLabel";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "../ProviderLogo";
import { CompareGrid, CompareNoteRow, CompareRow, CompareSection, MODEL_COLOURS, useCompareGrid, type CompareCell } from "./CompareGrid";
import { bestIndices, distinctDigits, priceRow, timeValue, visibleOnPhone, type Direction, type VerdictReason, type Verdicts } from "./compareViewMath";
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

/** Which of the five standard icons a type lights. Speech, music and transcription are audio. */
function baseKey(type: string): string | null {
	const lower = type.toLowerCase();
	if (/audio|speech|music|transcri|tts|stt/.test(lower)) return "audio";
	if (lower === "file" || lower === "pdf" || lower === "document") return "file";
	if (lower.startsWith("image")) return "image";
	if (lower.startsWith("video")) return "video";
	if (lower === "text") return "text";
	return null;
}

/** Types the five icons don't cover (decisions, embeddings, rerank, …), in the row's order. */
function extraTypes(models: CompareViewModel[], field: "inputTypes" | "outputTypes"): string[] {
	return [...new Set(models.flatMap((model) => model[field].map((type) => type.toLowerCase())).filter((type) => !baseKey(type)))];
}

/**
 * One icon per modality, lit in the models-page filter colours when the model
 * supports it. Types outside the five (such as decisions) get the models-page
 * icon too, added to every column of the row so the icons stay aligned.
 */
function ModalityIcons({ types, extras }: { types: string[]; extras: string[] }) {
	const modalityLabel = useModalityLabel();
	const lower = new Set(types.map((type) => type.toLowerCase()));
	const lit = new Set([...lower].map(baseKey));
	const icons = [
		...MODALITY_ICONS.map(([key, Icon]) => ({ key, Icon, on: lit.has(key), label: modalityLabel(key) })),
		...extras.map((type) => ({ key: type, Icon: getModalityIcon(type), on: lower.has(type), label: modalityLabel(type) })),
	];
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5">
			{icons.map(({ key, Icon, on, label }) => (
				<span
					key={key}
					title={on ? label : undefined}
					className={cn("inline-flex size-6 items-center justify-center rounded-md", on ? getModalityTone(key).sidebarIconSelectedClassName : "text-muted-foreground/30")}
					aria-hidden
				>
					<Icon className="size-3.5" />
				</span>
			))}
			<span className="sr-only">{types.map(modalityLabel).join(", ")}</span>
		</span>
	);
}

function modalityCells(models: CompareViewModel[], field: "inputTypes" | "outputTypes", empty: string): CompareCell[] {
	const extras = extraTypes(models, field);
	return models.map((model) => {
		const types = model[field];
		if (!types.length) return { content: empty, text: "", muted: true };
		return { content: <ModalityIcons types={types} extras={extras} />, text: [...types].sort().join(",") };
	});
}

/** The route count, then each provider's logo with its name on hover. */
/** Popular open models have up to 30 routes; past this the rest fold into "+N", which opens the Providers table. */
const SHOWN_ROUTES = 8;

function RouteList({ count, providers }: { count: string; providers: CompareViewModel["providers"] }) {
	const t = useTranslations("Catalogue.compareView");
	const hidden = providers.slice(SHOWN_ROUTES);
	return (
		<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
			{count}
			<span className="inline-flex flex-wrap items-center gap-1">
				{providers.slice(0, SHOWN_ROUTES).map((provider) => (
					<Tip key={provider.id} label={provider.name}>
						<Link href={`/api-providers/${provider.id}`} aria-label={provider.name} className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
							<ProviderLogo id={provider.logoId ?? provider.id} alt="" size="xxs" />
						</Link>
					</Tip>
				))}
				{hidden.length ? (
					<Tip label={hidden.map((provider) => provider.name).join(", ")}>
						<a href="#providers" className="rounded-md px-1 text-xs text-muted-foreground tabular-nums hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
							{t("moreCount", { count: hidden.length })}
						</a>
					</Tip>
				) : null}
			</span>
		</span>
	);
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
	const tokenCells = (field: "contextWindow" | "maxOutput") => {
		const values = models.map((model) => model[field]?.tokens);
		const digits = distinctDigits(values, format.compactTokens);
		return numericCells(values, "higher", (value) => <WithUnit value={format.compactTokens(value, digits)} unit={tokens} />, t("notPublished"),
			(index) => (models[index]![field]?.source === "providers" ? t("fromProviders") : undefined));
	};
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
				<CompareRow label={t("contextWindow")} cells={tokenCells("contextWindow")} />
				<CompareRow label={t("maxOutput")} cells={tokenCells("maxOutput")} />
				<CompareRow label={t("takes")} cells={modalityCells(models, "inputTypes", t("notPublished"))} />
				<CompareRow label={t("returns")} cells={modalityCells(models, "outputTypes", t("notPublished"))} />
				<CompareRow
					label={t("routes")}
					cells={numericCells(models.map((model) => model.providers.length || null), "higher", (value, index) => <RouteList count={t("routeCount", { count: value })} providers={models[index]!.providers} />, t("noRoutes"))}
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
					cells={numericCells(models.map((model) => usage[model.id]?.latencyP50Ms30m), "lower", (value) => format.latency(value), t("noRecentTraffic"))}
				/>
				<CompareRow
					label={t("throughput")}
					labelSub={windowNote("throughputWindow")}
					cells={numericCells(models.map((model) => usage[model.id]?.throughputP50TokPerSec30m), "higher", (value) => format.throughput(value), t("noRecentTraffic"))}
				/>
				<CompareRow
					label={t("requests24h")}
					cells={numericCells(models.map((model) => usage[model.id]?.totalRequests || null), null, (value) => format.tokens(value), t("noRequests24h"))}
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
	// Tools, structured outputs, reasoning, search and prompt caching are text-generation features:
	// for video, speech, embedding or decision models every one of those rows would read "Not listed".
	const textModels = models.some((model) => model.outputTypes.some((type) => type.toLowerCase() === "text"));
	const quantisations = priced.map((model, index) => models[index]!.providers.find((route) => route.id === model.pricing?.provider.id)?.quantisation ?? null);
	if (!textModels && quantisations.every((value) => !value)) return null;
	return (
		<CompareSection id="features" title={t("features")} description={t("featuresGroupSource")}>
			<CompareGrid label={t("features")}>
				{textModels ? (
					<>
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
					</>
				) : null}
				<CompareRow
					label={t("quantisation")}
					labelSub={t("onChosenRoute")}
					cells={quantisations.map((quantisation): CompareCell => (quantisation
						? { content: quantisation, text: quantisation }
						: { content: t("notStated"), text: "", muted: true }))}
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
