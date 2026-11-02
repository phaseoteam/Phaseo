"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { updateWorkItem } from "@/app/(dashboard)/work/actions";
import { Link } from "@/i18n/navigation";
import { applyBoardMoves, boardColumns, boardMovesReducer, dropTarget } from "@/lib/work/board";
import { slaStatus } from "@/lib/work/sla";
import { cn } from "@/lib/utils";
import { WORK_ITEM_STATES, type WorkItem, type WorkItemState, type WorkMember } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { AssigneeLabel, PriorityIcon, SlaBadge, StateIcon, useWorkCopy } from "./WorkBits";

/**
 * Columns by state. Dragging a card to another column changes its state straight away and saves it;
 * if the save fails the card goes back. Keyboard: focus a card, press space, move with arrows, space again.
 */
export function WorkBoard({ items, members, states = WORK_ITEM_STATES }: { items: WorkItem[]; members: WorkMember[]; states?: readonly WorkItemState[] }) {
	const t = useTranslations("Work.board");
	const copy = useWorkCopy();
	const { perform } = useWorkAction();
	const [moves, dispatch] = useReducer(boardMovesReducer, {});
	const [dragging, setDragging] = useState<WorkItem | null>(null);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

	// Once the refreshed server data shows a move, stop overriding it.
	useEffect(() => { dispatch({ type: "settle", items }); }, [items]);

	const shown = useMemo(() => applyBoardMoves(items, moves), [items, moves]);
	const columns = useMemo(() => boardColumns(shown, states), [shown, states]);

	const onDragStart = (event: DragStartEvent) => setDragging(shown.find((item) => `item:${item.number}` === event.active.id) ?? null);

	const onDragEnd = async (event: DragEndEvent) => {
		setDragging(null);
		const item = shown.find((entry) => `item:${entry.number}` === event.active.id);
		if (!item) return;
		const state = dropTarget(item, event.over?.id);
		if (!state) return;
		const previous = moves[item.number];
		dispatch({ type: "move", number: item.number, state });
		const result = await perform(`move-${item.number}`, () => updateWorkItem(item.number, { state }));
		if (!result.ok) dispatch({ type: "rollback", number: item.number, previous });
	};

	return (
		<DndContext
			sensors={sensors}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragCancel={() => setDragging(null)}
			accessibility={{
				screenReaderInstructions: { draggable: t("dragInstructions") },
				announcements: {
					onDragStart: () => t("dragStarted"),
					onDragOver: ({ over }) => (over ? t("dragOver", { state: copy.state(String(over.id).slice(7) as WorkItemState) }) : t("dragNowhere")),
					onDragEnd: ({ over }) => (over ? t("dropped", { state: copy.state(String(over.id).slice(7) as WorkItemState) }) : t("dragCancelled")),
					onDragCancel: () => t("dragCancelled"),
				},
			}}
		>
			<div className="flex gap-3 overflow-x-auto pb-2" role="list" aria-label={t("label")}>
				{columns.map((column) => <BoardColumnView key={column.state} state={column.state} items={column.items} members={members} />)}
			</div>
			<DragOverlay dropAnimation={null}>{dragging ? <BoardCard item={dragging} members={members} overlay /> : null}</DragOverlay>
		</DndContext>
	);
}

function BoardColumnView({ state, items, members }: { state: WorkItemState; items: WorkItem[]; members: WorkMember[] }) {
	const t = useTranslations("Work.board");
	const copy = useWorkCopy();
	const { setNodeRef, isOver } = useDroppable({ id: `column:${state}` });
	return (
		<section role="listitem" aria-label={copy.state(state)} ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-md border bg-muted/20 p-2 transition-colors", isOver && "border-foreground/40 bg-muted/60")}>
			<h3 className="flex items-center gap-1.5 px-1 text-xs font-medium">
				<StateIcon state={state} />
				{copy.state(state)}
				<span className="text-muted-foreground tabular-nums">{items.length}</span>
			</h3>
			<ul className="flex min-h-16 flex-col gap-1.5">
				{items.map((item) => <DraggableCard key={item.id} item={item} members={members} />)}
				{items.length ? null : <li className="px-1 py-4 text-center text-xs text-muted-foreground">{t("emptyColumn")}</li>}
			</ul>
		</section>
	);
}

function DraggableCard({ item, members }: { item: WorkItem; members: WorkMember[] }) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `item:${item.number}` });
	return (
		<li ref={setNodeRef} {...attributes} {...listeners} className={cn("rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-40")}>
			<BoardCard item={item} members={members} />
		</li>
	);
}

function BoardCard({ item, members, overlay = false }: { item: WorkItem; members: WorkMember[]; overlay?: boolean }) {
	const copy = useWorkCopy();
	return (
		<div className={cn("space-y-1.5 rounded-md border bg-background px-2.5 py-2 text-sm", overlay && "cursor-grabbing shadow-sm")}>
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<PriorityIcon priority={item.priority} label={copy.priority(item.priority)} className="size-3.5" />
				<span className="font-mono tabular-nums">#{item.number}</span>
				<SlaBadge status={slaStatus(item)} compact />
				{typeof item.estimate === "number" ? <span className="ml-auto tabular-nums">{item.estimate}</span> : null}
			</div>
			<Link href={`/work/${item.number}`} draggable={false} className="line-clamp-2 hover:underline">{item.title}</Link>
			<div className="flex items-center justify-between gap-2">
				<span className="flex min-w-0 gap-1 overflow-hidden">
					{item.labels.slice(0, 2).map((label) => <span key={label} className="truncate rounded-md border px-1.5 py-px text-[11px] text-muted-foreground">{label}</span>)}
				</span>
				<AssigneeLabel agent={item.assigneeAgent} userId={item.assigneeUserId} members={members} compact />
			</div>
		</div>
	);
}
