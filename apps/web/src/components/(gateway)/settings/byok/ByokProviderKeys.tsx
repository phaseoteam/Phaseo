"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
	type DragCancelEvent,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, GripVertical, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BYOKInputDialog from "@/components/(gateway)/settings/byok/BYOKInputDialog";
import DeleteKeyButton from "@/components/(gateway)/settings/byok/DeleteKeyButton";
import { reorderByokKeyAction, updateByokKeyAction } from "@/app/(dashboard)/settings/byok/actions";
import { MAX_BYOK_KEYS_PER_MODE } from "@/lib/byok/constants";

export type ByokKeyEntry = {
	id: string;
	providerId: string;
	name: string;
	prefix?: string;
	suffix?: string;
	lastUsedAt: string | null;
	enabled: boolean;
	errorMessage: string | null;
	alwaysUse: boolean;
	routingMode: "priority" | "fallback";
	sortOrder: number;
	verificationStatus: string | null;
	allowedModelSlugs?: string[];
	allowedApiKeyIds?: string[];
	sample?: boolean;
};

type Option = { value: string; label: string };

function maskKey(prefix?: string, suffix?: string) {
	return `${prefix ?? ""}${"*".repeat(6)}${suffix ?? ""}`;
}

function KeySummary({ entry }: { entry: ByokKeyEntry }) {
	const format = useDisplayFormatters();
	const modelCount = entry.allowedModelSlugs?.length ?? 0;
	const apiKeyCount = entry.allowedApiKeyIds?.length ?? 0;
	return (
		<div className="min-w-0 rounded-lg px-2 py-1.5">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<span className="truncate text-sm font-medium">{entry.name}</span>
				{!entry.enabled ? <Badge variant="secondary">Disabled</Badge> : null}
				{entry.errorMessage ? <Badge variant="destructive">Needs attention</Badge> : null}
				{entry.sample ? <Badge variant="outline">Sample</Badge> : null}
			</div>
			<div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
				<span className="font-mono">{maskKey(entry.prefix, entry.suffix)}</span>
				<span>{entry.lastUsedAt ? `Last used ${format.dateTime(entry.lastUsedAt)}` : "Never used"}</span>
				<span>{modelCount ? `${modelCount} models` : "All models"}</span>
				<span>{apiKeyCount ? `${apiKeyCount} API keys` : "All API keys"}</span>
			</div>
		</div>
	);
}

function SortableKeyRow({ entry, index, count, provider, modelOptions, apiKeyOptions, disabled, expanded, onToggle, onMove }: {
	entry: ByokKeyEntry;
	index: number;
	count: number;
	provider: { id: string; name: string };
	modelOptions: Option[];
	apiKeyOptions: Option[];
	disabled: boolean;
	expanded: boolean;
	onToggle: () => void;
	onMove: (direction: "up" | "down") => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id, disabled });
	const [testModel, setTestModel] = useState(entry.allowedModelSlugs?.[0] ?? modelOptions[0]?.value ?? "");
	return (
		<div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`rounded-xl border bg-background ${isDragging ? "opacity-30" : ""}`}>
			<div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
				<button type="button" className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing" aria-label={`Drag ${entry.name} to reorder`} {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
				<Badge variant="outline" className="min-w-8 justify-center px-1.5 tabular-nums">{index + 1}</Badge>
				<button type="button" className="min-w-0 text-left" onClick={onToggle} aria-expanded={expanded}><KeySummary entry={entry} /></button>
				<div className="flex items-center gap-1">
					{entry.sample ? null : <><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || index === 0} onClick={() => onMove("up")} aria-label="Move key up"><ArrowUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || index === count - 1} onClick={() => onMove("down")} aria-label="Move key down"><ArrowDown className="h-3.5 w-3.5" /></Button><DeleteKeyButton id={entry.id} /></>}
					<Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle} aria-label={expanded ? "Collapse key" : "Expand key"}><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></Button>
				</div>
			</div>
			{expanded ? <div className="space-y-4 border-t px-4 py-4">
				{testModel ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-medium">Test this key</div><p className="text-xs text-muted-foreground">Open a model covered by this key in Chat.</p></div><div className="flex items-center gap-2"><Select value={testModel} onValueChange={setTestModel}><SelectTrigger className="h-9 w-[220px] rounded-lg"><SelectValue /></SelectTrigger><SelectContent>{modelOptions.filter((option) => !entry.allowedModelSlugs?.length || entry.allowedModelSlugs.includes(option.value)).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><Button asChild variant="outline" size="sm" className="rounded-lg"><Link href={`/chat?model=${encodeURIComponent(testModel)}&prompt=${encodeURIComponent(`Test ${entry.name} for ${provider.name} BYOK routing with a brief response.`)}`}>Test<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link></Button></div></div> : null}
				{entry.sample ? <p className="text-sm text-muted-foreground">Sample keys are read-only. Add a real key to manage its settings and routing scopes here.</p> : <BYOKInputDialog embedded providerId={provider.id} providerName={provider.name} modelOptions={modelOptions} apiKeyOptions={apiKeyOptions} initial={{ id: entry.id, providerId: entry.providerId, name: entry.name, prefix: entry.prefix, suffix: entry.suffix, enabled: entry.enabled, always_use: entry.alwaysUse, allowedModelSlugs: entry.allowedModelSlugs, allowedApiKeyIds: entry.allowedApiKeyIds }} onCancel={onToggle} />}
			</div> : null}
		</div>
	);
}

function KeySection({ provider, mode, entries, modelOptions, apiKeyOptions, saving, expandedId, draftMode, onToggle, onAdd, onCancelDraft, onMove }: {
	provider: { id: string; name: string };
	mode: "priority" | "fallback";
	entries: ByokKeyEntry[];
	modelOptions: Option[];
	apiKeyOptions: Option[];
	saving: boolean;
	expandedId: string | null;
	draftMode: "priority" | "fallback" | null;
	onToggle: (id: string) => void;
	onAdd: (mode: "priority" | "fallback") => void;
	onCancelDraft: () => void;
	onMove: (id: string, direction: "up" | "down") => void;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: `section-${mode}` });
	const isPriority = mode === "priority";
	const atLimit = entries.length >= MAX_BYOK_KEYS_PER_MODE;
	return (
		<section ref={setNodeRef} className={`space-y-3 rounded-xl transition-colors ${isOver ? "bg-muted/30 ring-1 ring-ring/40" : ""}`}>
			<div className="flex items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-2"><h2 className="text-base font-semibold">{isPriority ? "Prioritized" : "Fallback"}</h2><span className="text-xs tabular-nums text-muted-foreground">{entries.length}/{MAX_BYOK_KEYS_PER_MODE}</span></div>
					<p className="mt-0.5 text-sm text-muted-foreground">{isPriority ? "Phaseo tries these credentials first, from top to bottom." : "These credentials take over only when the managed route cannot complete the request."}</p>
				</div>
				<Button type="button" variant="outline" size="sm" className="rounded-lg" disabled={atLimit} onClick={() => onAdd(mode)}>{atLimit ? "Key limit reached" : "Add key"}</Button>
			</div>
			<SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
				{entries.length === 0 ? (
					<div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border/70 px-4 py-6 text-center"><div><KeyRound className="mx-auto h-4 w-4 text-muted-foreground" /><div className="mt-2 text-sm font-medium">No {isPriority ? "prioritized" : "fallback"} keys</div><p className="mt-1 text-xs text-muted-foreground">Drop a key here or add a new credential.</p></div></div>
				) : (
					<div className="space-y-2">{entries.map((entry, index) => <SortableKeyRow key={entry.id} entry={entry} index={index} count={entries.length} provider={provider} modelOptions={modelOptions} apiKeyOptions={apiKeyOptions} disabled={saving} expanded={expandedId === entry.id} onToggle={() => onToggle(entry.id)} onMove={(direction) => onMove(entry.id, direction)} />)}</div>
				)}
			</SortableContext>
			{draftMode === mode ? <div className="rounded-xl border bg-background p-4"><div className="mb-4 flex items-center gap-2"><Badge variant="outline">New</Badge><span className="text-sm font-medium">{isPriority ? "Prioritized" : "Fallback"} key</span></div><BYOKInputDialog embedded providerId={provider.id} providerName={provider.name} modelOptions={modelOptions} apiKeyOptions={apiKeyOptions} defaultAlwaysUse={isPriority} onCancel={onCancelDraft} onSaved={onCancelDraft} /></div> : null}
		</section>
	);
}

export function reorderByokEntries(entries: ByokKeyEntry[], activeId: string, overId: string): ByokKeyEntry[] {
	const active = entries.find((entry) => entry.id === activeId);
	if (!active) return entries;
	const targetMode = overId.startsWith("section-")
		? overId.slice("section-".length) as "priority" | "fallback"
		: entries.find((entry) => entry.id === overId)?.routingMode;
	if (!targetMode) return entries;
	const sourceMode = active.routingMode;
	const source = entries.filter((entry) => entry.routingMode === sourceMode);
	const target = sourceMode === targetMode ? source : entries.filter((entry) => entry.routingMode === targetMode);
	const sourceIndex = source.findIndex((entry) => entry.id === activeId);
	const targetIndex = overId.startsWith("section-") ? target.length : Math.max(0, target.findIndex((entry) => entry.id === overId));
	if (sourceMode === targetMode) {
		if (sourceIndex === targetIndex) return entries;
		const moved = arrayMove(source, sourceIndex, targetIndex).map((entry, index) => ({ ...entry, sortOrder: index }));
		return entries.map((entry) => moved.find((candidate) => candidate.id === entry.id) ?? entry);
	}
	const movedEntry = { ...active, routingMode: targetMode, alwaysUse: targetMode === "priority" };
	const nextSource = source.filter((entry) => entry.id !== activeId).map((entry, index) => ({ ...entry, sortOrder: index }));
	const nextTarget = [...target];
	nextTarget.splice(targetIndex, 0, movedEntry);
	const normalizedTarget = nextTarget.map((entry, index) => ({ ...entry, sortOrder: index }));
	const unaffected = entries.filter((entry) => entry.routingMode !== sourceMode && entry.routingMode !== targetMode);
	return [...unaffected, ...nextSource, ...normalizedTarget];
}

export default function ByokProviderKeys({ provider, entries, modelOptions, apiKeyOptions }: { provider: { id: string; name: string }; entries: ByokKeyEntry[]; modelOptions: Option[]; apiKeyOptions: Option[] }) {
	const write = useSettingsWrite();
	const [displayEntries, setDisplayEntries] = useState(() => [...entries].sort((a, b) => a.sortOrder - b.sortOrder));
	const [activeId, setActiveId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [draftMode, setDraftMode] = useState<"priority" | "fallback" | null>(null);
	const originRef = useRef<ByokKeyEntry[] | null>(null);
	const currentRef = useRef(displayEntries);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
	const setEntries = (next: ByokKeyEntry[]) => { currentRef.current = next; setDisplayEntries(next); };
	useEffect(() => {
		const next = [...entries].sort((a, b) => a.sortOrder - b.sortOrder);
		currentRef.current = next;
		setDisplayEntries(next);
	}, [entries]);
	const priority = displayEntries.filter((entry) => entry.routingMode === "priority").sort((a, b) => a.sortOrder - b.sortOrder);
	const fallback = displayEntries.filter((entry) => entry.routingMode === "fallback").sort((a, b) => a.sortOrder - b.sortOrder);
	const activeEntry = activeId ? displayEntries.find((entry) => entry.id === activeId) ?? null : null;

	async function persistChange(id: string, before: ByokKeyEntry[], after: ByokKeyEntry[]) {
		const previous = before.find((entry) => entry.id === id);
		const next = after.find((entry) => entry.id === id);
		if (!previous || !next || next.sample) return;
		setSaving(true);
		try {
			await write((async () => {
				if (previous.routingMode !== next.routingMode) await updateByokKeyAction(id, { always_use: next.routingMode === "priority" });
				const targetModeEntries = after.filter((entry) => entry.routingMode === next.routingMode).sort((a, b) => a.sortOrder - b.sortOrder);
				const targetIndex = targetModeEntries.findIndex((entry) => entry.id === id);
				const startingIndex = previous.routingMode === next.routingMode
					? before.filter((entry) => entry.routingMode === previous.routingMode).sort((a, b) => a.sortOrder - b.sortOrder).findIndex((entry) => entry.id === id)
					: targetModeEntries.length - 1;
				const direction = targetIndex < startingIndex ? "up" : "down";
				for (let step = 0; step < Math.abs(targetIndex - startingIndex); step += 1) await reorderByokKeyAction(id, direction);
			})());
		} catch (error) {
			setEntries(before);
			toast.error(error instanceof Error ? error.message : "Failed to reorder key");
		} finally { setSaving(false); }
	}

	function handleDragStart(event: DragStartEvent) { originRef.current = currentRef.current.map((entry) => ({ ...entry })); setActiveId(String(event.active.id)); }
	function handleDragOver(event: DragOverEvent) { if (!event.over) return; setEntries(reorderByokEntries(currentRef.current, String(event.active.id), String(event.over.id))); }
	function handleDragCancel(_event: DragCancelEvent) { if (originRef.current) setEntries(originRef.current); originRef.current = null; setActiveId(null); }
	function handleDragEnd(event: DragEndEvent) { const before = originRef.current; const after = currentRef.current; originRef.current = null; setActiveId(null); if (before && event.over) void persistChange(String(event.active.id), before, after); else if (before) setEntries(before); }
	function moveWithButtons(id: string, direction: "up" | "down") { const before = currentRef.current; const entry = before.find((candidate) => candidate.id === id); if (!entry) return; const modeEntries = before.filter((candidate) => candidate.routingMode === entry.routingMode).sort((a, b) => a.sortOrder - b.sortOrder); const index = modeEntries.findIndex((candidate) => candidate.id === id); const target = modeEntries[index + (direction === "up" ? -1 : 1)]; if (!target) return; const after = reorderByokEntries(before, id, target.id); setEntries(after); void persistChange(id, before, after); }

	return (
		<div className="grid gap-6">
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragCancel={handleDragCancel} onDragEnd={handleDragEnd}>
			<div className="grid gap-8"><KeySection provider={provider} mode="priority" entries={priority} modelOptions={modelOptions} apiKeyOptions={apiKeyOptions} saving={saving} expandedId={expandedId} draftMode={draftMode} onToggle={(id) => setExpandedId((current) => current === id ? null : id)} onAdd={(mode) => { setDraftMode(mode); setExpandedId(null); }} onCancelDraft={() => setDraftMode(null)} onMove={moveWithButtons} /><KeySection provider={provider} mode="fallback" entries={fallback} modelOptions={modelOptions} apiKeyOptions={apiKeyOptions} saving={saving} expandedId={expandedId} draftMode={draftMode} onToggle={(id) => setExpandedId((current) => current === id ? null : id)} onAdd={(mode) => { setDraftMode(mode); setExpandedId(null); }} onCancelDraft={() => setDraftMode(null)} onMove={moveWithButtons} /></div>
			<DragOverlay>{activeEntry ? <div className="w-[min(640px,80vw)] rounded-xl border bg-background px-3 py-2 shadow-xl"><KeySummary entry={activeEntry} /></div> : null}</DragOverlay>
		</DndContext>
		</div>
	);
}
