import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
	type MouseEvent,
	type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "@/i18n/react";
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
		if (section.items.length === 0) return [];
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

/**
 * Moves the active option for ArrowUp and ArrowDown. Returns null for any other key, so the caller
 * leaves the event alone: Home, End and their Shift variants move the cursor and select text in the
 * search field, as in the WAI-ARIA editable combobox pattern.
 */
export function getNextVirtualizedModelCatalogItemKey(
	itemKeys: string[],
	activeItemKey: string | null,
	key: string,
): string | null {
	if (itemKeys.length === 0) return null;
	const currentIndex = activeItemKey ? itemKeys.indexOf(activeItemKey) : -1;
	switch (key) {
		case "ArrowDown":
			return itemKeys[Math.min(currentIndex + 1, itemKeys.length - 1)] ?? null;
		case "ArrowUp":
			return itemKeys[Math.max(currentIndex - 1, 0)] ?? null;
		default:
			return null;
	}
}

/**
 * Points a cmdk search input at the virtualised listbox.
 *
 * cmdk's input spreads our props first and then writes its own
 * `aria-activedescendant` (its selected cmdk item, which is undefined here
 * because the virtualised options aren't cmdk items) and `aria-controls` (its
 * own list, which isn't rendered). Props can't win, so this sets the DOM
 * attributes after each commit. React leaves them alone because cmdk's values
 * don't change while the catalogue is showing. Only attributes this hook set
 * are undone, so cmdk's own values take over again when `enabled` turns off.
 *
 * Returns a stable callback ref for the input. It tracks the element in state,
 * so the attributes are applied even when a dialog mounts the input late.
 */
export function useVirtualizedModelCatalogInput({
	enabled,
	activeItemKey,
	listboxId,
}: {
	enabled: boolean;
	activeItemKey: string | null;
	listboxId: string;
}): (input: HTMLInputElement | null) => void {
	const [input, setInput] = useState<HTMLInputElement | null>(null);
	useLayoutEffect(() => {
		if (!enabled || !input) return;
		const previousControls = input.getAttribute("aria-controls");
		const activeDescendant = activeItemKey
			? getVirtualizedModelCatalogItemId(activeItemKey)
			: null;
		input.setAttribute("aria-controls", listboxId);
		if (activeDescendant) {
			input.setAttribute("aria-activedescendant", activeDescendant);
		} else {
			input.removeAttribute("aria-activedescendant");
		}
		return () => {
			if (input.getAttribute("aria-controls") === listboxId) {
				if (previousControls === null) input.removeAttribute("aria-controls");
				else input.setAttribute("aria-controls", previousControls);
			}
			if (
				activeDescendant &&
				input.getAttribute("aria-activedescendant") === activeDescendant
			) {
				input.removeAttribute("aria-activedescendant");
			}
		};
	}, [activeItemKey, enabled, input, listboxId]);
	return setInput;
}

type VirtualizedModelCatalogProps<T> = {
	sections: VirtualizedModelCatalogSection<T>[];
	getItemKey: (item: T) => string;
	activeItemKey: string | null;
	isItemDisabled: (item: T) => boolean;
	onActiveItemChange: (itemKey: string) => void;
	onSelectItem: (item: T, event: MouseEvent<HTMLDivElement>) => void;
	renderItem: (item: T) => ReactNode;
	estimateItemSize?: number;
	emptyContent?: ReactNode;
	maxHeightPx?: number;
	/** Lets a search input point `aria-controls` at the list. */
	listboxId?: string;
};

export function VirtualizedModelCatalog<T>({
	sections,
	getItemKey,
	activeItemKey,
	isItemDisabled,
	onActiveItemChange,
	onSelectItem,
	renderItem,
	estimateItemSize = 36,
	emptyContent,
	maxHeightPx,
	listboxId,
}: VirtualizedModelCatalogProps<T>) {
	const t = useTranslations("Product.chat.modelPicker");
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
			return estimateItemSize;
		},
		overscan: 10,
	});

	useEffect(() => {
		if (activeRowIndex < 0) return;
		virtualizer.scrollToIndex(activeRowIndex, { align: "auto" });
	}, [activeRowIndex, virtualizer]);

	if (rows.length === 0) {
		// Keeps the listbox id, so the search input's aria-controls still points at something, and
		// announces that nothing matched.
		return (
			<div id={listboxId} role="status" className="py-6 text-center text-sm">
				{emptyContent ?? t("noModelsFound")}
			</div>
		);
	}

	return (
		<ScrollArea
			className="max-h-[70vh]"
			viewportClassName="p-3"
			viewportRef={setScrollViewport}
			style={{
				height: maxHeightPx
					? `min(70vh, ${maxHeightPx}px, ${virtualizer.getTotalSize() + 24}px)`
					: `min(70vh, ${virtualizer.getTotalSize() + 24}px)`,
			}}
		>
			<div
				id={listboxId}
				role="listbox"
				aria-label={t("suggestions")}
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
								// Focus stays on the search input; every consumer moves through the options with the keyboard via aria-activedescendant.
								// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
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
										"relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-sm outline-hidden transition-colors hover:bg-muted hover:text-foreground",
										"data-[selected=true]:bg-muted data-[selected=true]:text-foreground",
										isItemDisabled(row.item) &&
											"pointer-events-none opacity-50",
									)}
									onMouseMove={() => {
										if (!isItemDisabled(row.item)) {
											onActiveItemChange(getItemKey(row.item));
										}
									}}
									onMouseDown={(event) => event.preventDefault()}
									onClick={(event) => {
										if (!isItemDisabled(row.item)) {
											onSelectItem(row.item, event);
										}
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
