"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { isUniform, visibleOnPhone } from "./compareViewMath";

export const MODEL_COLOURS = ["#0ea5e9", "#10b981", "#f59e0b", "#a855f7"];

type GridSettings = {
	modelCount: number;
	phonePage: number;
	highlightBest: boolean;
	differencesOnly: boolean;
	/** Screen-reader text after a highlighted value. */
	bestLabel: string;
};

const GridContext = createContext<GridSettings>({ modelCount: 1, phonePage: 0, highlightBest: true, differencesOnly: false, bestLabel: "best" });

export function CompareGridProvider({ value, children }: { value: GridSettings; children: ReactNode }) {
	return <GridContext.Provider value={value}>{children}</GridContext.Provider>;
}

export function useCompareGrid() {
	return useContext(GridContext);
}

/** A label column, then one column per model. The sticky model header uses the same columns, so values sit under their model. */
export function gridStyle(modelCount: number): CSSProperties {
	return { "--compare-columns": `minmax(8rem,13rem) repeat(${modelCount}, minmax(0,1fr))` } as CSSProperties;
}

/** Phones show the label above two values. */
export const GRID_CLASS = "grid grid-cols-2 gap-x-4 sm:[grid-template-columns:var(--compare-columns)]";

export function CompareSection({
	id,
	title,
	description,
	actions,
	children,
}: {
	id: string;
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section id={id} aria-labelledby={`compare-${id}`} className="scroll-mt-48 space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
				<div className="min-w-0">
					<h2 id={`compare-${id}`} className="text-lg font-semibold tracking-tight">{title}</h2>
					{description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
				</div>
				{actions}
			</div>
			{children}
		</section>
	);
}

export function CompareGrid({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
	const { modelCount } = useCompareGrid();
	return (
		<div role="table" aria-label={label} style={gridStyle(modelCount)} className={cn("w-full", className)}>
			{children}
		</div>
	);
}

/** A sub-heading inside a section's table, e.g. a benchmark category. */
export function CompareGroup({ title, source }: { title: string; source?: ReactNode }) {
	return (
		<div role="row" className="pt-4 pb-1 text-sm font-medium first:pt-0 sm:px-3">
			<span role="columnheader">{title}</span>
			{source ? <span className="ml-2 text-xs font-normal text-muted-foreground">{source}</span> : null}
		</div>
	);
}

export type CompareCell = {
	content: ReactNode;
	/** Plain text used to spot rows that are the same for every model. */
	text: string;
	best?: boolean;
	muted?: boolean;
	sub?: ReactNode;
};

export function CompareRow({
	label,
	labelSub,
	cells,
	alwaysShow = false,
}: {
	label: ReactNode;
	labelSub?: ReactNode;
	cells: CompareCell[];
	alwaysShow?: boolean;
}) {
	const { phonePage, highlightBest, differencesOnly, bestLabel } = useCompareGrid();
	if (!alwaysShow && differencesOnly && isUniform(cells.map((cell) => cell.text))) return null;
	return (
		<div role="row" className={cn(GRID_CLASS, "border-b border-border/60 py-2 text-sm transition-colors hover:bg-muted/30 sm:items-baseline sm:py-3")}>
			<div role="rowheader" className="col-span-2 pb-1 text-xs text-muted-foreground sm:col-span-1 sm:px-3 sm:pb-0 sm:text-sm">
				{label}
				{labelSub ? <span className="mt-0.5 block text-xs text-muted-foreground/80">{labelSub}</span> : null}
			</div>
			{cells.map((cell, index) => {
				const best = highlightBest && cell.best;
				return (
					<div
						key={index}
						role="cell"
						className={cn(
							"min-w-0 font-medium tabular-nums sm:px-3",
							!visibleOnPhone(index, phonePage) && "hidden sm:block",
							best && "text-emerald-600 dark:text-emerald-400",
							cell.muted && "font-normal text-muted-foreground",
						)}
					>
						<span className="inline-flex items-baseline gap-1">
							<span className="min-w-0 break-words">{cell.content}</span>
							{best ? <Check aria-hidden className="size-3.5 shrink-0 self-center" /> : null}
						</span>
						{best ? <span className="sr-only"> ({bestLabel})</span> : null}
						{cell.sub ? <span className="block text-xs font-normal text-muted-foreground">{cell.sub}</span> : null}
					</div>
				);
			})}
		</div>
	);
}

/** A full-width row inside a grid, for notes like "3 rows hidden". */
export function CompareNoteRow({ children }: { children: ReactNode }) {
	return (
		<div role="row" className="border-b border-border/60 py-2 text-xs text-muted-foreground sm:px-3">
			<span role="cell">{children}</span>
		</div>
	);
}
