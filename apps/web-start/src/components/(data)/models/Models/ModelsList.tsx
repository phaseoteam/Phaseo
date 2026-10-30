import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useWindowVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { ModelListItem } from "@/components/(data)/models/Models/ModelListItem";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";

type ModelListLike = Omit<ModelCardType, "gateway_status"> & {
	gateway_status?:
		| ModelCardType["gateway_status"]
		| "coming_soon"
		| "deprecated"
		| "retired"
		| null;
};

interface ModelsListProps {
	filteredModels: ModelListLike[];
	showOrganisationPrefix?: boolean;
}

const VIRTUALIZE_AFTER_ROWS = 80;
const VIRTUAL_OVERSCAN_ROWS = 8;
const DEFAULT_ROW_HEIGHT = 106;
// Window observers populate the exact viewport after hydration. A non-zero
// estimate keeps the first virtual rows visible while that observer attaches.
const INITIAL_WINDOW_RECT = { width: 0, height: 900 };

function VirtualModelsList({ filteredModels, showOrganisationPrefix = false }: ModelsListProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [scrollMargin, setScrollMargin] = useState(0);
	const lastNonEmptyVirtualRowsRef = useRef<VirtualItem[]>([]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const updateScrollMargin = () => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			setScrollMargin(rect.top + window.scrollY);
		};
		updateScrollMargin();
		window.addEventListener("resize", updateScrollMargin);
		return () => window.removeEventListener("resize", updateScrollMargin);
	}, [filteredModels.length]);

	const rowVirtualizer = useWindowVirtualizer({
		count: filteredModels.length,
		estimateSize: () => DEFAULT_ROW_HEIGHT,
		overscan: VIRTUAL_OVERSCAN_ROWS,
		initialRect: INITIAL_WINDOW_RECT,
		scrollMargin,
	});
	const virtualRows = rowVirtualizer.getVirtualItems();
	const measureRowElement = useCallback(
		(node: HTMLDivElement | null) => {
			if (node) rowVirtualizer.measureElement(node);
		},
		[rowVirtualizer],
	);

	useEffect(() => {
		lastNonEmptyVirtualRowsRef.current = [];
	}, [filteredModels.length]);

	if (virtualRows.length > 0) {
		// The virtualizer's last stable measurement is an imperative cache, not render state.
		// eslint-disable-next-line react-hooks/refs
		lastNonEmptyVirtualRowsRef.current = virtualRows;
	}
	// Reading the imperative cache avoids a blank frame while the virtualizer recalculates.
	const rowsToRender =
		// eslint-disable-next-line react-hooks/refs
		virtualRows.length > 0 ? virtualRows : lastNonEmptyVirtualRowsRef.current;

	return (
		<div ref={containerRef} className="relative">
			<div
				className="relative"
				style={{ height: `${Math.max(rowVirtualizer.getTotalSize(), DEFAULT_ROW_HEIGHT)}px` }}
			>
				{rowsToRender.map((virtualRow) => {
					const model = filteredModels[virtualRow.index];
					if (!model) return null;
					return (
						<div
							key={model.model_id}
							data-index={virtualRow.index}
							ref={measureRowElement}
							className="absolute left-0 top-0 w-full"
							style={{
								transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
							}}
						>
							<ModelListItem model={model} showOrganisationPrefix={showOrganisationPrefix} />
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ModelsListImpl(props: ModelsListProps) {
	const t = useTranslations("Catalogue.models");

	if (props.filteredModels.length === 0) {
		return (
			<div className="rounded-md border bg-card px-4 py-10 text-center text-muted-foreground">
				{t("noModelsForFilters")}
			</div>
		);
	}

	if (props.filteredModels.length <= VIRTUALIZE_AFTER_ROWS) {
		return (
			<div className="border-t border-border/70">
				{props.filteredModels.map((model) => (
					<ModelListItem
						key={model.model_id}
						model={model}
						showOrganisationPrefix={props.showOrganisationPrefix}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="border-t border-border/70">
			<VirtualModelsList {...props} />
		</div>
	);
}

export const ModelsList = React.memo(ModelsListImpl);

export default ModelsList;
