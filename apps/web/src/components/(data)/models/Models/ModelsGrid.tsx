import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";

type ModelCardLike = Omit<ModelCardType, "gateway_status"> & {
	gateway_status?: ModelCardType["gateway_status"] | "coming_soon" | null;
	router_requests_30d?: number | null;
	router_spend_nanos_30d?: number | null;
};

interface ModelsGridProps {
	filteredModels: ModelCardLike[];
	showOrganisationPrefix?: boolean;
}

type ModelsGridContentProps = ModelsGridProps & {
	columns: number;
};

type ModelRow = {
	key: string;
	models: ModelCardLike[];
};

const VIRTUALIZE_AFTER_ROWS = 60;
const VIRTUAL_OVERSCAN_ROWS = 14;
const SERVER_RENDERED_MODEL_COUNT = 18;
const DEFAULT_DESKTOP_ROW_HEIGHT = 208;
const DEFAULT_MOBILE_ROW_HEIGHT = 320;
const DEFAULT_WIDE_DESKTOP_ROW_HEIGHT = 196;
// Window observers populate the exact viewport after hydration. A non-zero
// estimate keeps the first virtual rows visible while that observer attaches.
const INITIAL_WINDOW_RECT = { width: 0, height: 900 };

function chunkModels(models: ModelCardLike[], columns: number): ModelRow[] {
	const rows: ModelRow[] = [];
	for (let index = 0; index < models.length; index += columns) {
		const rowModels = models.slice(index, index + columns);
		rows.push({
			key: rowModels.map((model) => model.model_id).join("__") || `row-${index}`,
			models: rowModels,
		});
	}
	return rows;
}

function useColumnCount(): number | null {
	const [columnCount, setColumnCount] = useState<number | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const desktopQuery = window.matchMedia("(min-width: 768px)");
		const wideDesktopQuery = window.matchMedia("(min-width: 1536px)");
		const update = () => {
			if (wideDesktopQuery.matches) {
				setColumnCount(3);
				return;
			}
			if (desktopQuery.matches) {
				setColumnCount(2);
				return;
			}
			setColumnCount(1);
		};

		update();
		desktopQuery.addEventListener("change", update);
		wideDesktopQuery.addEventListener("change", update);
		return () => {
			desktopQuery.removeEventListener("change", update);
			wideDesktopQuery.removeEventListener("change", update);
		};
	}, []);

	return columnCount;
}

function getRenderedColumns(targetColumns: number, itemCount: number): number {
	return Math.max(1, Math.min(targetColumns, Math.max(1, itemCount)));
}

function getRowGridClass(targetColumns: number, itemCount: number): string {
	const columns = getRenderedColumns(targetColumns, itemCount);
	if (columns >= 3) return "grid grid-cols-1 gap-px bg-border/70 md:grid-cols-2 2xl:grid-cols-3";
	if (columns === 2) return "grid grid-cols-1 gap-px bg-border/70 md:grid-cols-2";
	return "grid grid-cols-1 gap-px bg-transparent";
}

function getCellPaddingClass(rowColumnIndex: number, renderedColumns: number): string {
	void rowColumnIndex;
	if (renderedColumns >= 2) return "md:px-3";
	return "";
}

function ModelsGridContent({
	filteredModels,
	showOrganisationPrefix = false,
	columns,
}: ModelsGridContentProps) {
	const rows = useMemo(
		() => chunkModels(filteredModels, columns),
		[filteredModels, columns],
	);
	const shouldVirtualize = rows.length > VIRTUALIZE_AFTER_ROWS;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [scrollMargin, setScrollMargin] = useState(0);
	const lastNonEmptyVirtualRowsRef = useRef<VirtualItem[]>([]);
	const hasCalibratedEstimateRef = useRef(false);
	const baseEstimatedRowHeight =
		columns >= 3
			? DEFAULT_WIDE_DESKTOP_ROW_HEIGHT
			: columns === 2
				? DEFAULT_DESKTOP_ROW_HEIGHT
				: DEFAULT_MOBILE_ROW_HEIGHT;
	const [estimatedRowHeight, setEstimatedRowHeight] = useState(
		baseEstimatedRowHeight,
	);

	useEffect(() => {
		if (!shouldVirtualize || typeof window === "undefined") return;
		const updateScrollMargin = () => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			setScrollMargin(rect.top + window.scrollY);
		};

		updateScrollMargin();
		window.addEventListener("resize", updateScrollMargin);
		return () => window.removeEventListener("resize", updateScrollMargin);
	}, [shouldVirtualize, rows.length, columns]);

	const rowVirtualizer = useWindowVirtualizer({
		count: rows.length,
		estimateSize: () => estimatedRowHeight,
		overscan: VIRTUAL_OVERSCAN_ROWS,
		initialRect: INITIAL_WINDOW_RECT,
		scrollMargin,
		enabled: shouldVirtualize,
	});

	const virtualRows = rowVirtualizer.getVirtualItems();
	const measureRowElement = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node) return;
			rowVirtualizer.measureElement(node);

			if (hasCalibratedEstimateRef.current) return;
			const measuredHeight = Math.ceil(node.getBoundingClientRect().height);
			if (measuredHeight <= 0) return;
			hasCalibratedEstimateRef.current = true;
			if (Math.abs(measuredHeight - estimatedRowHeight) > 8) {
				setEstimatedRowHeight(measuredHeight);
			}
		},
		[rowVirtualizer, estimatedRowHeight],
	);

	useEffect(() => {
		lastNonEmptyVirtualRowsRef.current = [];
	}, [rows.length, columns]);

	if (virtualRows.length > 0) {
		lastNonEmptyVirtualRowsRef.current = virtualRows;
	}

	if (!shouldVirtualize) {
		return (
			<div className="bg-border/70">
				<div className="space-y-px">
					{rows.map((row) => (
						<div
							key={row.key}
							className={getRowGridClass(columns, row.models.length)}
						>
							{row.models.map((model, rowColumnIndex) => {
								const renderedColumns = getRenderedColumns(
									columns,
									row.models.length,
								);
								const sideClass = getCellPaddingClass(
									rowColumnIndex,
									renderedColumns,
								);
								return (
									<div key={model.model_id} className="bg-background">
										<ModelCard
											model={model}
											showOrganisationPrefix={showOrganisationPrefix}
											contentPaddingClassName={sideClass}
										/>
									</div>
								);
							})}
						</div>
					))}
				</div>
			</div>
		);
	}

	const rowsToRender =
		virtualRows.length > 0 ? virtualRows : lastNonEmptyVirtualRowsRef.current;

	return (
		<div ref={containerRef} className="relative bg-background">
			<div
				className="relative"
				style={{
					height: `${Math.max(rowVirtualizer.getTotalSize(), estimatedRowHeight)}px`,
				}}
			>
				{rowsToRender.map((virtualRow) => {
					const row = rows[virtualRow.index];
					const isLastRow = virtualRow.index === rows.length - 1;
					return (
						<div
							key={row.key}
							data-index={virtualRow.index}
							ref={measureRowElement}
							className={`absolute left-0 top-0 w-full bg-background ${
								isLastRow ? "" : "border-b border-border/70"
							}`}
							style={{
								transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
							}}
						>
							<div className={getRowGridClass(columns, row.models.length)}>
								{row.models.map((model, rowColumnIndex) => {
									const renderedColumns = getRenderedColumns(
										columns,
										row.models.length,
									);
									const sideClass = getCellPaddingClass(
										rowColumnIndex,
										renderedColumns,
									);
									return (
										<div key={model.model_id} className="bg-background">
											<ModelCard
												model={model}
												showOrganisationPrefix={showOrganisationPrefix}
												contentPaddingClassName={sideClass}
											/>
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ServerRenderedModelsGrid({
	filteredModels,
	showOrganisationPrefix = false,
}: ModelsGridProps) {
	return (
		<div className="bg-border/70">
			<div className="grid grid-cols-1 gap-px md:grid-cols-2 2xl:grid-cols-3">
				{filteredModels.slice(0, SERVER_RENDERED_MODEL_COUNT).map((model) => (
					<div key={model.model_id} className="bg-background">
						<ModelCard
							model={model}
							showOrganisationPrefix={showOrganisationPrefix}
							contentPaddingClassName="md:px-3"
						/>
					</div>
				))}
			</div>
		</div>
	);
}

function ModelsGridImpl(props: ModelsGridProps) {
	const columns = useColumnCount();

	if (props.filteredModels.length === 0) {
		return (
			<div className="rounded-2xl border bg-card px-4 py-10 text-center text-muted-foreground">
				No models found for the selected filters.
			</div>
		);
	}
	if (columns === null) {
		return <ServerRenderedModelsGrid {...props} />;
	}

	return <ModelsGridContent key={columns} {...props} columns={columns} />;
}

export const ModelsGrid = React.memo(ModelsGridImpl);

export default ModelsGrid;
