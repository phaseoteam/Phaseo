"use client";

import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	type DragEndEvent,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export type SortablePresetOption = {
	id: string;
	label: string;
	icon?: ReactNode;
};

function SortableRow({ item, index, isDefault, onRemove }: {
	item: SortablePresetOption;
	index: number;
	isDefault: boolean;
	onRemove: () => void;
}) {
	const t = useTranslations("SettingsUI");
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-b px-3 py-1.5 last:border-b-0 ${isDragging ? "relative z-10 bg-background opacity-70 shadow-md" : "bg-background"}`}
		>
			<button type="button" className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing" aria-label={`Drag ${item.label} to reorder`} {...attributes} {...listeners}>
				<GripVertical className="h-3.5 w-3.5" />
			</button>
			<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1 text-[11px] font-medium tabular-nums">{index + 1}</span>
			<div className="flex min-w-0 items-center gap-2">
				{item.icon}
				<span className="truncate text-sm font-medium">{item.label}</span>
			</div>
			{isDefault ? <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">{t("labels.default")}</Badge> : null}
			<Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded-md" onClick={onRemove} aria-label={`Remove ${item.label}`}>
				<X className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}

export function SortablePresetList({ items, onChange, defaultFirst = false, emptyLabel }: {
	items: SortablePresetOption[];
	onChange: (ids: string[]) => void;
	defaultFirst?: boolean;
	emptyLabel: string;
}) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	function onDragEnd(event: DragEndEvent) {
		if (!event.over || event.active.id === event.over.id) return;
		const from = items.findIndex((item) => item.id === event.active.id);
		const to = items.findIndex((item) => item.id === event.over?.id);
		if (from < 0 || to < 0) return;
		onChange(arrayMove(items, from, to).map((item) => item.id));
	}
	if (!items.length) return <div className="rounded-md border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
			<SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
				<div className="overflow-hidden rounded-md border">
					{items.map((item, index) => <SortableRow key={item.id} item={item} index={index} isDefault={defaultFirst && index === 0} onRemove={() => onChange(items.filter((entry) => entry.id !== item.id).map((entry) => entry.id))} />)}
				</div>
			</SortableContext>
		</DndContext>
	);
}
