"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ModelCombobox from "../ModelCombobox";
import { ProviderLogo } from "../ProviderLogo";
import type { CompareModelOption } from "../types";
import { GRID_CLASS, gridStyle, MODEL_COLOURS } from "./CompareGrid";
import { routeOptions, routeTiers, visibleOnPhone, type RouteChoice } from "./compareViewMath";
import type { CompareViewModel } from "./types";
import { useCompareFormat } from "./useCompareFormat";

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
	return (
		<button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex h-8 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground">
			<span className={cn("relative h-4 w-7 shrink-0 rounded-[4px] bg-muted-foreground/30 transition-colors", on && "bg-sky-600")} aria-hidden>
				<span className={cn("absolute top-0.5 left-0.5 size-3 rounded-[3px] bg-background transition-transform", on && "translate-x-3")} />
			</span>
			{label}
		</button>
	);
}

const NO_ROUTE = "__none__";

function RoutePickers({
	model,
	priced,
	tier,
	onChange,
}: {
	model: CompareViewModel;
	/** The model priced on the chosen route. */
	priced: CompareViewModel;
	tier: string;
	onChange: (choice: Partial<RouteChoice>) => void;
}) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const routes = routeOptions(model);
	const current = priced.pricing?.provider;
	const tiers = routeTiers(priced);
	const listingOnly = current && !current.routed;
	const routeItems = routes.length
		? routes.map((route) => ({ value: route.id, label: route.name }))
		: [{ value: NO_ROUTE, label: current ? t("listedOnly", { provider: current.name }) : t("notPriced") }];

	return (
		<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)]">
			<Select
				value={current?.id ?? NO_ROUTE}
				items={routeItems}
				disabled={routes.length < 2 || Boolean(listingOnly)}
				onValueChange={(value) => {
					if (typeof value === "string" && value !== NO_ROUTE) onChange({ provider: value });
				}}
			>
				<SelectTrigger aria-label={t("routeFor", { name: model.name })} className="h-8 w-full min-w-0 rounded-md bg-background px-2 text-xs">
					{current ? <ProviderLogo id={current.id} alt="" size="xxs" className="mr-1.5 hidden shrink-0 sm:flex" /> : null}
					<SelectValue className="truncate" />
				</SelectTrigger>
				<SelectContent>
					{routeItems.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							<span className="inline-flex items-center gap-2">
								{item.value !== NO_ROUTE ? <ProviderLogo id={item.value} alt="" size="xxs" /> : null}
								{item.label}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={tier}
				items={(tiers.length ? tiers : [tier]).map((value) => ({ value, label: format.tier(value) }))}
				disabled={tiers.length < 2}
				onValueChange={(value) => {
					if (typeof value === "string") onChange({ tier: value });
				}}
			>
				<SelectTrigger aria-label={t("tierFor", { name: model.name })} className="h-8 rounded-md bg-background px-2 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{(tiers.length ? tiers : [tier]).map((value) => (
						<SelectItem key={value} value={value}>{format.tier(value)}</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/**
 * The sticky model header. It shares the table's columns, so each model's
 * name, route and tier sit directly above its values.
 */
export function CompareHeader({
	models,
	priced,
	tiers,
	phonePage,
	onPhonePageChange,
	onRouteChange,
	onRemove,
	highlightBest,
	onHighlightBestChange,
	differencesOnly,
	onDifferencesOnlyChange,
	selectedOptions,
	selectedIds,
	onSelectedIdsChange,
}: {
	models: CompareViewModel[];
	priced: CompareViewModel[];
	tiers: string[];
	phonePage: number;
	onPhonePageChange: (page: number) => void;
	onRouteChange: (modelId: string, choice: Partial<RouteChoice>) => void;
	onRemove: (modelId: string) => void;
	highlightBest: boolean;
	onHighlightBestChange: (on: boolean) => void;
	differencesOnly: boolean;
	onDifferencesOnlyChange: (on: boolean) => void;
	selectedOptions: CompareModelOption[];
	selectedIds: string[];
	onSelectedIdsChange: (ids: string[]) => void;
}) {
	const t = useTranslations("Catalogue.compareView");
	const pages = Math.max(1, Math.ceil(models.length / 2));
	const addModel = models.length < 4 ? (
		<ModelCombobox
			selectedOptions={selectedOptions}
			selected={selectedIds}
			setSelected={onSelectedIdsChange}
			labelWhenSelected={t("addModel")}
			showSelectionCount={false}
			className="h-8 w-full justify-start rounded-md border border-dashed border-border px-2 text-xs"
		/>
	) : null;
	const toggles = (
		<>
			<Toggle on={highlightBest} onChange={onHighlightBestChange} label={t("highlightBest")} />
			<Toggle on={differencesOnly} onChange={onDifferencesOnlyChange} label={t("differencesOnly")} />
		</>
	);

	return (
		<>
			<div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:hidden">
				<div className="flex gap-3">{toggles}</div>
				<div className="w-32">{addModel}</div>
			</div>
			<div className="sticky top-[var(--site-header-height,4rem)] z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
				<div role="group" aria-label={t("selectedModels")} style={gridStyle(models.length)} className={cn(GRID_CLASS, "items-stretch gap-y-2")}>
					<div className="hidden flex-col justify-center gap-0.5 sm:flex">
						{toggles}
						<div className="mt-1">{addModel}</div>
					</div>
					{models.map((model, index) => (
						<div key={model.id} className={cn("min-w-0 space-y-1.5 rounded-md border border-border bg-card p-1.5", !visibleOnPhone(index, phonePage) && "hidden sm:block")}>
							<div className="flex h-8 items-center gap-2 pl-1">
								<span aria-hidden className="h-5 w-1 shrink-0 rounded-sm" style={{ background: MODEL_COLOURS[index] }} />
								<ProviderLogo id={model.lab.id} alt={model.lab.name} size="xxs" className="hidden shrink-0 sm:flex" />
								<span className="min-w-0 flex-1 truncate text-sm font-semibold" title={model.name}>{model.name}</span>
								<Link
									href={`/models/${model.id}`}
									className="hidden size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
									aria-label={t("openModel", { name: model.name })}
								>
									<ArrowUpRight className="size-3.5" />
								</Link>
								<button
									type="button"
									onClick={() => onRemove(model.id)}
									className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-label={t("remove", { name: model.name })}
								>
									<X className="size-3.5" />
								</button>
							</div>
							<RoutePickers
								model={model}
								priced={priced[index]!}
								tier={tiers[index]!}
								onChange={(choice) => onRouteChange(model.id, choice)}
							/>
						</div>
					))}
				</div>
				{pages > 1 ? (
					<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground sm:hidden">
						<button type="button" onClick={() => onPhonePageChange(Math.max(0, phonePage - 1))} disabled={phonePage === 0} className="inline-flex h-9 items-center gap-1 rounded-md px-2 disabled:opacity-40">
							<ChevronLeft className="size-4" />{t("previous")}
						</button>
						<span aria-live="polite">{t("modelsRange", { from: phonePage * 2 + 1, to: Math.min(models.length, phonePage * 2 + 2), total: models.length })}</span>
						<button type="button" onClick={() => onPhonePageChange(Math.min(pages - 1, phonePage + 1))} disabled={phonePage >= pages - 1} className="inline-flex h-9 items-center gap-1 rounded-md px-2 disabled:opacity-40">
							{t("next")}<ChevronRight className="size-4" />
						</button>
					</div>
				) : null}
			</div>
		</>
	);
}
