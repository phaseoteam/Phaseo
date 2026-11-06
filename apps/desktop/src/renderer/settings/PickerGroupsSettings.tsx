import { useMemo, useRef } from "react";
import { ChevronDown, ChevronsUp, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import type { Harness } from "../../shared/workspace";
import { usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import { HarnessLogo } from "../components/HarnessLogo";
import { ModelLogo } from "../components/ModelLogo";
import { Switch } from "../components/ui/switch";
import { harnessNames, phaseoLabGroups } from "../chat/ModelPicker";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import { useModelPopularity } from "../lib/modelPopularity";
import { useModels } from "../lib/useModels";
import { arrangeGroups, defaultPickerGroups, moveGroup, usePickerGroups, type PickerGroupPrefs } from "../lib/pickerGroups";
import { usePointerReorder } from "../lib/pointerReorder";
import { cn } from "../lib/utils";
import { SettingsButton, SettingsSection } from "./SettingsLayout";

type Row = { id: string; label: string; lab?: string };

/**
 * One block of the picker's column (agents, or Phaseo): a switch to show each group; drag by the handle, the arrows or
 * "Move to the top" to reorder.
 */
function Block({ title, rows, prefs, onChange }: { title: string; rows: Row[]; prefs: PickerGroupPrefs; onChange: (prefs: PickerGroupPrefs) => void }) {
	// Hidden groups stay in the list, switched off, where they would go.
	const ordered = arrangeGroups(rows, { ...prefs, hidden: [] });
	const list = useRef<HTMLDivElement>(null);
	const hidden = new Set(prefs.hidden);
	const place = (id: string, to: number) => onChange(moveGroup(prefs, ordered.map(row => row.id), id, to));
	const toggle = (id: string, on: boolean) => onChange({ ...prefs, hidden: on ? prefs.hidden.filter(value => value !== id) : [...prefs.hidden, id] });
	const { drag, start: startDrag } = usePointerReorder({ list, items: () => "[data-group-row]", onDrop: place });
	if (!rows.length) return null;
	return <div className={cn("flex flex-col", drag && "cursor-grabbing select-none")}>
		<p className="px-4 pt-3 pb-1.5 text-xs text-muted-foreground">{title}</p>
		<div ref={list} className="flex flex-col">
			{ordered.map((row, index) => <div key={row.id} data-group-row data-reorder-id={row.id}
				className={cn("group/row relative flex h-10 items-center gap-2.5 border-t border-border/60 px-4 first:border-t-0", drag?.id === row.id && "bg-muted/60 opacity-60", hidden.has(row.id) && "text-muted-foreground")}>
				{drag && drag.over === index && drag.id !== row.id && <span aria-hidden className="absolute inset-x-3 -top-px h-0.5 rounded-full bg-primary" />}
				{drag && drag.over === ordered.length && index === ordered.length - 1 && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
				<button type="button" aria-label={`Drag ${row.label}`} onPointerDown={event => startDrag(event, row.id)} className="-ml-1 grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground"><GripVertical className="size-4" /></button>
				<span className={cn("flex size-5 shrink-0 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4", hidden.has(row.id) && "opacity-50")}>
					{row.lab ? <ModelLogo model={{ id: `${row.lab}/model`, name: row.label, organisationId: row.lab }} harness="phaseo" /> : <HarnessLogo harness={row.id as Harness} />}
				</span>
				<span className="min-w-0 flex-1 truncate text-[13px]">{row.label}</span>
				<span className={cn("flex opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100", drag && "invisible")}>
					<button type="button" aria-label={`Move ${row.label} to the top`} title="Move to the top" disabled={index === 0} onClick={() => place(row.id, 0)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ChevronsUp className="size-4" /></button>
					<button type="button" aria-label={`Move ${row.label} up`} title="Move up" disabled={index === 0} onClick={() => place(row.id, index - 1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ChevronUp className="size-4" /></button>
					<button type="button" aria-label={`Move ${row.label} down`} title="Move down" disabled={index === ordered.length - 1} onClick={() => place(row.id, index + 1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ChevronDown className="size-4" /></button>
				</span>
				<Switch size="sm" aria-label={`Show ${row.label}`} checked={!hidden.has(row.id)} onCheckedChange={on => toggle(row.id, on)} />
			</div>)}
		</div>
	</div>;
}

/** Settings › Appearance › Model picker: which groups its left column shows, and their order. */
export function PickerGroupsSettings() {
	const { overview } = useWorkspace();
	const [prefs, setPrefs] = usePickerGroups();
	const connected = useConnectedHarnesses();
	const phaseoAccount = usablePhaseoAccounts(overview)[0];
	const { models } = useModels("phaseo", phaseoAccount?.id, undefined, undefined, !!phaseoAccount);
	const popularity = useModelPopularity(!!phaseoAccount);
	const agents = useMemo(() => [...connected].filter(harness => harness !== "phaseo" && harness !== "acp").map(harness => ({ id: harness, label: harnessNames[harness] })), [connected]);
	const phaseo = useMemo(() => phaseoAccount ? [{ id: "phaseo", label: "All Phaseo models" }, ...phaseoLabGroups(models.filter(model => !model.latestOf), popularity)] : [], [phaseoAccount, models, popularity]);
	const changed = prefs.order.length > 0 || prefs.hidden.length > 0;
	return <SettingsSection title="Model picker" description="The groups down the picker's left. Switch one off to hide it and its models; drag the handle or use the arrows to reorder."
		action={changed ? <SettingsButton variant="ghost" onClick={() => setPrefs(defaultPickerGroups)}><RotateCcw />Reset</SettingsButton> : undefined}>
		<Block title="Agents" rows={agents} prefs={prefs} onChange={setPrefs} />
		<Block title="Phaseo" rows={phaseo} prefs={prefs} onChange={setPrefs} />
		{!agents.length && !phaseo.length && <p className="px-4 py-3 text-[13px] text-muted-foreground">Sign in to Phaseo or connect an agent to choose its groups.</p>}
	</SettingsSection>;
}
