"use client";

import { useTranslations } from "next-intl";

import { useId } from "react";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	useDroppable,
	type Modifier,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Check,
	GripVertical,
	Settings2,
	Pin,
	PinOff,
	Rows2,
	Rows3,
	Rows4,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { TableColumnPreference, TableDensity } from "./tablePreferences";

const restrictToColumnList: Modifier = ({
	transform,
	draggingNodeRect,
	containerNodeRect,
	scrollableAncestorRects,
}) => {
	const bounds = scrollableAncestorRects[0] ?? containerNodeRect;
	if (!draggingNodeRect || !bounds) return { ...transform, x: 0 };
	const minY = bounds.top - draggingNodeRect.top;
	const maxY = bounds.bottom - draggingNodeRect.bottom;
	return {
		...transform,
		x: 0,
		y: Math.min(Math.max(transform.y, minY), Math.max(minY, maxY)),
	};
};
const columnDragModifiers = [restrictToColumnList];

function ColumnGroupTarget({
	pinned,
	empty,
}: {
	pinned: boolean;
	empty: boolean;
}) {
	const t = useTranslations("SettingsUI");
	const { setNodeRef, isOver } = useDroppable({
		id: pinned ? "pinned-columns" : "unpinned-columns",
	});
	return (
		<div
			ref={setNodeRef}
			className={cn(
				"rounded-md px-2 py-2 text-xs text-muted-foreground",
				isOver && "bg-accent text-accent-foreground",
			)}
		>
			<div className="flex items-center gap-1.5 font-medium">
				{pinned && <Pin className="size-3" />}
				{pinned ? t("realtimeCopy.copyPinned") : t("realtimeCopy.unpin")}
			</div>
			{empty && (
				<div className="mt-2 rounded-md border border-dashed px-2 py-3 text-center">
					{pinned ? t("realtimeCopy.dragPin") : t("realtimeCopy.dragUnpin")}
				</div>
			)}
		</div>
	);
}

function ColumnOption<Id extends string>({
	column,
	label,
	disabled,
	onToggle,
	onPin,
}: {
	column: TableColumnPreference<Id>;
	label: string;
	disabled: boolean;
	onToggle: () => void;
	onPin: () => void;
}) {
	const t = useTranslations("SettingsUI");
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id: column.id });
	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className="flex items-center gap-1 rounded-md bg-popover px-1 hover:bg-muted/50"
		>
			<button
				type="button"
				{...attributes}
				{...listeners}
				aria-label={t("realtimeCopy.reorderColumn", { label })}
				className="touch-none cursor-grab rounded p-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
			>
				<GripVertical className="size-4" />
			</button>
			<label className="flex min-h-7 flex-1 cursor-pointer items-center justify-between gap-2 text-xs">
				{label}
				<input
					type="checkbox"
					checked={column.visible}
					disabled={disabled}
					onChange={onToggle}
					className="size-4 accent-foreground"
				/>
			</label>
			<button
				type="button"
				onClick={onPin}
				aria-label={column.pinned ? t("realtimeCopy.unpinColumnLabel", { label }) : t("realtimeCopy.pinColumn", { label })}
				title={column.pinned ? t("realtimeCopy.unpinColumn") : t("realtimeCopy.pinLeft")}
				className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
			>
				{column.pinned ? (
					<PinOff className="size-3.5" />
				) : (
					<Pin className="size-3.5" />
				)}
			</button>
		</div>
	);
}

export default function TableSettings<Id extends string>({
	columns,
	definitions,
	tableLabel,
	onReset,
	onChange,
	density,
	onDensityChange,
}: {
	columns: TableColumnPreference<Id>[];
	definitions: readonly { id: Id; label: string }[];
	tableLabel: string;
	onReset: () => void;
	onChange: (columns: TableColumnPreference<Id>[]) => void;
	density: TableDensity;
	onDensityChange: (density: TableDensity) => void;
}) {
	const t = useTranslations("SettingsUI");
	const columnLabel = (id: string | number) => id === "pinned-columns" ? t("realtimeCopy.copyPinned") : id === "unpinned-columns" ? t("realtimeCopy.unpin") : definitions.find(column => column.id === id)?.label ?? String(id);
	const densityGroupId = useId();
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	const count = columns.filter(({ visible }) => visible).length;
	return (
		<Popover>
			<PopoverTrigger
				className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
				aria-label={t("realtimeCopy.configureTable", { table: tableLabel })}
				title={t("realtimeCopy.tableSettings")}
			>
				<Settings2 className="size-4" />
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-64 max-w-[calc(100vw-2rem)] max-h-[var(--available-height)] gap-1 overflow-hidden p-2"
				aria-label={t("realtimeCopy.tableSettingsLabel", { table: tableLabel })}
			>
				<div className="flex items-center justify-between">
					<span className="font-medium">{t("realtimeCopy.tableSettings")}</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							onReset();
							onDensityChange("regular");
						}}
					>
						{t("realtimeCopy.copyReset")}</Button>
				</div>
				<Tabs defaultValue="columns" className="gap-2">
					<TabsList variant="line" className="w-full justify-start border-b">
						<TabsTrigger value="columns">{t("realtimeCopy.columns")}</TabsTrigger>
						<TabsTrigger value="density">{t("realtimeCopy.density")}</TabsTrigger>
					</TabsList>
					<TabsContent value="columns">
						<DndContext
							accessibility={{ screenReaderInstructions: { draggable: t("realtimeCopy.dragInstructions") }, announcements: { onDragStart: ({ active }) => t("realtimeCopy.dragStart", { label: columnLabel(active.id) }), onDragOver: ({ active, over }) => over ? t("realtimeCopy.dragOver", { label: columnLabel(active.id), target: columnLabel(over.id) }) : undefined, onDragEnd: ({ active }) => t("realtimeCopy.dragEnd", { label: columnLabel(active.id) }), onDragCancel: ({ active }) => t("realtimeCopy.dragCancel", { label: columnLabel(active.id) }) } }}
							sensors={sensors}
							modifiers={columnDragModifiers}
							collisionDetection={closestCenter}
							onDragEnd={({ active, over }) => {
								if (!over || active.id === over.id) return;
								const target = columns.find(({ id }) => id === over.id);
								const pinned =
									over.id === "pinned-columns" || Boolean(target?.pinned);
								const next = columns.map((column) =>
									column.id === active.id ? { ...column, pinned } : column,
								);
								const from = columns.findIndex(({ id }) => id === active.id);
								const to = columns.findIndex(({ id }) => id === over.id);
								if (from >= 0)
									onChange(to >= 0 ? arrayMove(next, from, to) : next);
							}}
						>
							<SortableContext
								items={columns.map(({ id }) => id)}
								strategy={verticalListSortingStrategy}
							>
								<ScrollArea
									className="h-[min(45vh,320px,calc(var(--available-height)-100px))]"
									viewportClassName="overscroll-contain pr-2"
									viewportProps={{ "aria-label": t("realtimeCopy.tableColumns") }}
								>
									<ColumnGroupTarget
										pinned
										empty={!columns.some(({ pinned }) => pinned)}
									/>
									{columns.flatMap((column, index) => [
										...(!column.pinned &&
										(index === 0 || columns[index - 1].pinned)
											? [
													<ColumnGroupTarget
														key="unpinned-columns"
														pinned={false}
														empty={false}
													/>,
												]
											: []),
										<ColumnOption
											key={column.id}
											column={column}
											label={
												definitions.find(({ id }) => id === column.id)?.label ??
												column.id
											}
											disabled={column.visible && count === 1}
											onPin={() =>
												onChange(
													columns.map((entry) =>
														entry.id === column.id
															? { ...entry, pinned: !entry.pinned }
															: entry,
													),
												)
											}
											onToggle={() =>
												onChange(
													columns.map((entry) =>
														entry.id === column.id
															? { ...entry, visible: !entry.visible }
															: entry,
													),
												)
											}
										/>,
									])}
									{columns.every(({ pinned }) => pinned) && (
										<ColumnGroupTarget pinned={false} empty />
									)}
								</ScrollArea>
							</SortableContext>
						</DndContext>
					</TabsContent>
					<TabsContent value="density">
						<fieldset className="py-1">
							<legend className="sr-only">{t("realtimeCopy.rowDensity")}</legend>
							{(
								[
									{ value: "compact", label: t("realtimeCopy.copyCompact"), icon: Rows4 },
									{ value: "regular", label: t("realtimeCopy.regular"), icon: Rows3 },
									{ value: "expanded", label: t("realtimeCopy.expanded"), icon: Rows2 },
								] as const
							).map(({ value, label, icon: Icon }) => (
								<label
									key={value}
									className="flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-xs hover:bg-muted/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
								>
									<Icon className="size-4 text-muted-foreground" />
									<span className="flex-1">{label}</span>
									<input
										type="radio"
										name={densityGroupId}
										value={value}
										checked={density === value}
										onChange={() => onDensityChange(value)}
										className="peer sr-only"
									/>
									<Check
										aria-hidden="true"
										className="size-4 shrink-0 opacity-0 peer-checked:opacity-100"
									/>
								</label>
							))}
						</fieldset>
					</TabsContent>
				</Tabs>
			</PopoverContent>
		</Popover>
	);
}
