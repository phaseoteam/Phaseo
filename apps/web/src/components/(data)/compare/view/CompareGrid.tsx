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

/** Label, one column per model, then a note column on wide screens. Phones show labels above two values. */
export function gridStyle(modelCount: number): CSSProperties {
	return { "--compare-columns": `minmax(9rem,13rem) repeat(${modelCount}, minmax(0,1fr)) minmax(0,9rem)` } as CSSProperties;
}

const GRID_CLASS = "grid grid-cols-2 gap-x-3 sm:[grid-template-columns:var(--compare-columns)]";

export function CompareGrid({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
	const { modelCount } = useCompareGrid();
	return (
		<div role="table" aria-label={label} style={gridStyle(modelCount)} className={cn("w-full", className)}>
			{children}
		</div>
	);
}

export function CompareGroup({ title, source }: { title: string; source?: ReactNode }) {
	return (
		<div role="row" className="mt-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs font-semibold first:mt-0">
			<span role="columnheader">{title}</span>
			{source ? <span className="ml-2 font-normal text-muted-foreground">{source}</span> : null}
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
	note,
	alwaysShow = false,
}: {
	label: ReactNode;
	labelSub?: ReactNode;
	cells: CompareCell[];
	note?: ReactNode;
	alwaysShow?: boolean;
}) {
	const { phonePage, highlightBest, differencesOnly, bestLabel } = useCompareGrid();
	if (!alwaysShow && differencesOnly && isUniform(cells.map((cell) => cell.text))) return null;
	return (
		<div role="row" className={cn(GRID_CLASS, "border-b border-border/70 py-2 text-sm sm:items-start sm:py-2.5")}>
			<div role="rowheader" className="col-span-2 px-1 pb-1 text-xs text-muted-foreground sm:col-span-1 sm:px-3 sm:pb-0 sm:text-sm sm:font-medium sm:text-foreground">
				{label}
				{labelSub ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{labelSub}</span> : null}
			</div>
			{cells.map((cell, index) => {
				const best = highlightBest && cell.best;
				return (
					<div
						key={index}
						role="cell"
						className={cn(
							"min-w-0 rounded-md px-1 tabular-nums sm:px-3",
							!visibleOnPhone(index, phonePage) && "hidden sm:block",
							best && "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300",
							cell.muted && "text-muted-foreground",
						)}
					>
						<span className="inline-flex items-center gap-1">
							{best ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
							<span className="min-w-0 break-words">{cell.content}</span>
						</span>
						{best ? <span className="sr-only"> ({bestLabel})</span> : null}
						{cell.sub ? <span className="block text-xs font-normal text-muted-foreground">{cell.sub}</span> : null}
					</div>
				);
			})}
			<div role="cell" className="hidden px-3 text-xs text-muted-foreground sm:block">{note}</div>
		</div>
	);
}

/** A full-width row inside a grid, for notes like "3 rows hidden". */
export function CompareNoteRow({ children }: { children: ReactNode }) {
	return (
		<div role="row" className="border-b border-border/70 px-1 py-2 text-xs text-muted-foreground sm:px-3">
			<span role="cell">{children}</span>
		</div>
	);
}
