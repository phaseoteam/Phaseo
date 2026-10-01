"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import TableSettings from "./TableSettings";
import {
	normalizeTableColumns,
	type TableColumnDefinition,
	type TableDensity,
} from "./tablePreferences";

export default function ConfigurableLogTable<Row, Id extends string>({
	tableId,
	label,
	definitions,
	rows,
	rowKey,
	renderCell,
	onRowClick,
	emptyMessage,
	settingsTargetId,
}: {
	tableId: string;
	label: string;
	definitions: readonly TableColumnDefinition<Id>[];
	rows: Row[];
	rowKey: (row: Row) => string;
	renderCell: (row: Row, column: Id) => React.ReactNode;
	onRowClick?: (row: Row) => void;
	emptyMessage: string;
	settingsTargetId?: string;
}) {
	const columnsKey = `phaseo.${tableId}.columns.v1`;
	const densityKey = `phaseo.${tableId}.density.v1`;
	const [columns, setColumns] = React.useState(() =>
		normalizeTableColumns(null, definitions),
	);
	const [density, setDensity] = React.useState<TableDensity>("regular");
	const [target, setTarget] = React.useState<HTMLElement | null>(null);
	React.useEffect(() => {
		setTarget(
			settingsTargetId ? document.getElementById(settingsTargetId) : null,
		);
		try {
			setColumns(
				normalizeTableColumns(
					JSON.parse(localStorage.getItem(columnsKey) ?? "null"),
					definitions,
				),
			);
			const saved = localStorage.getItem(densityKey);
			setDensity(
				saved === "compact" || saved === "expanded" ? saved : "regular",
			);
		} catch {
			/* Storage is optional. */
		}
	}, [columnsKey, densityKey, definitions, settingsTargetId]);
	const settings = (
		<TableSettings
			columns={columns}
			definitions={definitions}
			tableLabel={label}
			onChange={(next) => {
				const normalized = normalizeTableColumns(next, definitions);
				setColumns(normalized);
				try {
					localStorage.setItem(columnsKey, JSON.stringify(normalized));
				} catch {
					/* Visit-only preference. */
				}
			}}
			onReset={() => {
				setColumns(normalizeTableColumns(null, definitions));
				try {
					localStorage.removeItem(columnsKey);
				} catch {
					/* Visit-only preference. */
				}
			}}
			density={density}
			onDensityChange={(next) => {
				setDensity(next);
				try {
					localStorage.setItem(densityKey, next);
				} catch {
					/* Visit-only preference. */
				}
			}}
		/>
	);
	const visible = columns.filter(({ visible }) => visible);
	const order = visible.map(({ id }) => id).join(",");
	const tableRef = React.useRef<HTMLTableElement>(null);
	const [offsets, setOffsets] = React.useState<number[]>([]);
	React.useEffect(() => {
		const headers = Array.from(
			tableRef.current?.querySelectorAll("thead th") ?? [],
		);
		const measure = () => {
			let left = 0;
			const next = headers.map((header) => {
				const offset = left;
				left += header.getBoundingClientRect().width;
				return offset;
			});
			setOffsets((prev) =>
				prev.length === next.length &&
				prev.every((value, index) => value === next[index])
					? prev
					: next,
			);
		};
		const observer = new ResizeObserver(measure);
		headers.forEach((header) => observer.observe(header));
		measure();
		return () => observer.disconnect();
	}, [order]);
	const pinnedProps = (index: number) =>
		visible[index].pinned
			? {
					"data-pinned": true,
					style: {
						position: "sticky" as const,
						left: offsets[index] ?? 0,
						zIndex: 1,
						backgroundColor: "var(--background)",
						boxShadow: !visible[index + 1]?.pinned
							? "inset -1px 0 0 var(--border)"
							: undefined,
					},
				}
			: {};
	return (
		<>
			{target ? (
				createPortal(settings, target)
			) : (
				<div className="flex justify-end">{settings}</div>
			)}
			<div className="min-w-0 max-w-full overflow-hidden rounded-lg border">
				<ScrollArea
					scrollBarOrientation="horizontal"
					keepScrollbarMounted
					viewportClassName="w-full pb-2"
				>
					<Table
						ref={tableRef}
						wrapInContainer={false}
						aria-label={label}
						data-density={density}
						className={cn(
							"isolate border-separate border-spacing-0 whitespace-nowrap text-xs [&_tr]:border-0 [&_thead_th]:border-b [&_tbody_tr:not(:last-child)>td]:border-b",
							density === "compact"
								? "[&_tbody_td:not([colspan])]:py-1"
								: density === "expanded"
									? "[&_tbody_td:not([colspan])]:py-4"
									: "[&_tbody_td:not([colspan])]:py-2",
						)}
					>
						<TableHeader>
							<TableRow className="h-9">
								{visible.map(({ id }, index) => {
									const column = definitions.find(
										(column) => column.id === id,
									)!;
									return (
										<TableHead
											key={id}
											{...pinnedProps(index)}
											className={column.numeric ? "text-right" : undefined}
										>
											{column.description ? (
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="cursor-help underline decoration-dotted underline-offset-4">
															{column.label}
														</span>
													</TooltipTrigger>
													<TooltipContent className="max-w-64">
														{column.description}
													</TooltipContent>
												</Tooltip>
											) : (
												column.label
											)}
										</TableHead>
									);
								})}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.length ? (
								rows.map((row) => (
									<TableRow
										key={rowKey(row)}
										className={onRowClick ? "cursor-pointer" : undefined}
										onClick={() => onRowClick?.(row)}
									>
										{visible.map(({ id }, index) => (
											<TableCell
												key={id}
												{...pinnedProps(index)}
												className={
													definitions.find((column) => column.id === id)
														?.numeric
														? "text-right font-mono"
														: undefined
												}
											>
												{index === 0 && onRowClick && (
													<button
														type="button"
														className="sr-only focus:not-sr-only focus:rounded focus:px-2 focus:py-1 focus:ring-2 focus:ring-ring"
														aria-label={`Open details for ${label}: ${rowKey(row)}`}
														onClick={(event) => { event.stopPropagation(); onRowClick(row); }}
													>
														Open details
													</button>
												)}
												{renderCell(row, id)}
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={visible.length}
										className="h-28 text-center text-muted-foreground"
									>
										{emptyMessage}
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</ScrollArea>
			</div>
		</>
	);
}
