"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type TableSort<Key extends string> = { key: Key; direction: "asc" | "desc" } | null;

export function nextTableSort<Key extends string>(current: TableSort<Key>, key: Key): TableSort<Key> {
	if (!current || current.key !== key) return { key, direction: "desc" };
	return current.direction === "desc" ? { key, direction: "asc" } : null;
}

export function SortableTableHead<Key extends string>({ label, sortKey, activeSort, onSortChange, className }: {
	label: string; sortKey: Key; activeSort: TableSort<Key>; onSortChange: (key: Key) => void; className?: string;
}) {
	const active = activeSort?.key === sortKey;
	const Icon = !active ? ChevronsUpDown : activeSort.direction === "desc" ? ChevronDown : ChevronUp;
	return <TableHead className={cn("group", className)} aria-sort={active ? activeSort.direction === "asc" ? "ascending" : "descending" : undefined}>
		<button type="button" className={cn("inline-flex w-full items-center gap-1 text-left", className?.includes("text-right") ? "justify-end" : "justify-start")} onClick={() => onSortChange(sortKey)}>
			<span>{label}</span><Icon aria-hidden className={cn("h-3.5 w-3.5 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-60 group-focus-within:opacity-60")} />
		</button>
	</TableHead>;
}
