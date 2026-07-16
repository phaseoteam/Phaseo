"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type VirtualizedModelCatalogSection<T> = {
	key: string;
	heading: string;
	items: T[];
	separatorBefore?: boolean;
};

type VirtualizedModelCatalogRow<T> =
	| { type: "heading"; key: string; heading: string }
	| { type: "item"; key: string; item: T }
	| { type: "separator"; key: string };

export function buildVirtualizedModelCatalogRows<T>(
	sections: VirtualizedModelCatalogSection<T>[],
	getItemKey: (item: T) => string,
): VirtualizedModelCatalogRow<T>[] {
	return sections.flatMap((section) => {
		const rows: VirtualizedModelCatalogRow<T>[] = [];
		if (section.separatorBefore) {
			rows.push({ type: "separator", key: `${section.key}-separator` });
		}
		rows.push({
			type: "heading",
			key: `${section.key}-heading`,
			heading: section.heading,
		});
		rows.push(
			...section.items.map((item) => ({
				type: "item" as const,
				key: `${section.key}-${getItemKey(item)}`,
				item,
			})),
		);
		return rows;
	});
}

export function getVirtualizedModelCatalogItemId(itemKey: string): string {
	return `chat-model-option-${itemKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

type VirtualizedModelCatalogProps<T> = {
	sections: VirtualizedModelCatalogSection<T>[];
	getItemKey: (item: T) => string;
	activeItemKey: string | null;
	isItemDisabled: (item: T) => boolean;
	onActiveItemChange: (itemKey: string) => void;
	onSelectItem: (item: T) => void;
	renderItem: (item: T) => ReactNode;
};

export function VirtualizedModelCatalog<T>({
	sections,
	getItemKey,
	activeItemKey,
	isItemDisabled,
	onActiveItemChange,
	onSelectItem,
	renderItem,
}: VirtualizedModelCatalogProps<T>) {
	const [scrollViewport, setScrollViewport] =
		useState<HTMLDivElement | null>(null);
	const rows = useMemo(
		() => buildVirtualizedModelCatalogRows(sections, getItemKey),
		[sections, getItemKey],
	);
	const activeRowIndex = useMemo(
		() =>
			rows.findIndex(
				(row) =>
					row.type === "item" && getItemKey(row.item) === activeItemKey,
			),
		[activeItemKey, getItemKey, rows],
	);
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollViewport,
		estimateSize: (index) => {
			const row = rows[index];
			if (row?.type === "heading") return 32;
			if (row?.type === "separator") return 9;
			return 36;
		},
		overscan: 10,
	});

	useEffect(() => {
		if (activeRowIndex < 0) return;
		virtualizer.scrollToIndex(activeRowIndex, { align: "auto" });
	}, [activeRowIndex, virtualizer]);

	if (rows.length === 0) {
		return <div className="py-6 text-center text-sm">No models found.</div>;
	}

	return (
		<ScrollArea
			className="max-h-[70vh]"
			viewportClassName="p-3"
			viewportRef={setScrollViewport}
			style={{ height: `${Math.min(560, virtualizer.getTotalSize())}px` }}
		>
			<div
				role="listbox"
				aria-label="Suggestions"
				className="relative w-full"
				style={{ height: `${virtualizer.getTotalSize()}px` }}
			>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const row = rows[virtualRow.index];
					if (!row) return null;

					return (
						<div
							key={row.key}
							className="absolute left-0 top-0 w-full"
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{row.type === "heading" ? (
								<div className="flex h-8 items-center px-3 text-xs font-semibold text-foreground">
									{row.heading}
								</div>
							) : row.type === "separator" ? (
								<div className="my-1 h-px bg-border/50" />
							) : (
								<div
									id={getVirtualizedModelCatalogItemId(
										getItemKey(row.item),
									)}
									role="option"
									aria-selected={getItemKey(row.item) === activeItemKey}
									aria-disabled={isItemDisabled(row.item)}
									data-selected={
										getItemKey(row.item) === activeItemKey
											? "true"
											: undefined
									}
									className={cn(
										"relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-xl px-2 py-1 text-sm outline-hidden",
										"data-[selected=true]:bg-muted data-[selected=true]:text-foreground",
										isItemDisabled(row.item) &&
											"pointer-events-none opacity-50",
									)}
									onMouseMove={() =>
										onActiveItemChange(getItemKey(row.item))
									}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => {
										if (!isItemDisabled(row.item)) onSelectItem(row.item);
									}}
								>
									{renderItem(row.item)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</ScrollArea>
	);
}
