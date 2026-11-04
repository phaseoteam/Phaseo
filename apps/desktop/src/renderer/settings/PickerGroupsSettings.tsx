import { useMemo, useState, type DragEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import type { Harness } from "../../shared/workspace";
import { usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import { HarnessLogo } from "../components/HarnessLogo";
import { ModelLogo } from "../components/ModelLogo";
import { Switch } from "../components/ui/switch";
import { harnessNames, phaseoLabGroups } from "../chat/ModelPicker";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import { useModelPopularity } from "../lib/modelPopularity";
import { useModels } from "../lib/useModels";
import { arrangeGroups, defaultPickerGroups, usePickerGroups, type PickerGroupPrefs } from "../lib/pickerGroups";
import { cn } from "../lib/utils";
import { SettingsButton, SettingsSection } from "./SettingsLayout";

type Row = { id: string; label: string; lab?: string };

/** One block of the picker's column (agents, or Phaseo): a switch to show each group, and drag or arrows to reorder. */
function Block({ title, rows, prefs, onChange }: { title: string; rows: Row[]; prefs: PickerGroupPrefs; onChange: (prefs: PickerGroupPrefs) => void }) {
	// Hidden groups stay in the list, switched off, where they would go.
	const ordered = arrangeGroups(rows, { ...prefs, hidden: [] });
	const [dragging, setDragging] = useState<string>();
	const hidden = new Set(prefs.hidden);
	const place = (id: string, to: number) => {
		const ids = ordered.map(row => row.id).filter(value => value !== id);
		ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
		// This block's order replaces its old one; the other block's is kept.
		const mine = new Set(ids);
		onChange({ ...prefs, order: [...prefs.order.filter(value => !mine.has(value)), ...ids] });
	};
	const toggle = (id: string, on: boolean) => onChange({ ...prefs, hidden: on ? prefs.hidden.filter(value => value !== id) : [...prefs.hidden, id] });
	const drop = (event: DragEvent, index: number) => { event.preventDefault(); if (dragging) place(dragging, index); setDragging(undefined); };
	if (!rows.length) return null;
	return <div className="flex flex-col">
		<p className="px-4 pt-3 pb-1.5 text-xs text-muted-foreground">{title}</p>
		{ordered.map((row, index) => <div key={row.id} draggable onDragStart={event => { setDragging(row.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(undefined)}
			onDragOver={event => { if (dragging) event.preventDefault(); }} onDrop={event => drop(event, index)}
			className={cn("group/row flex h-10 items-center gap-2.5 border-t border-border/60 px-4 first-of-type:border-t-0", dragging === row.id && "opacity-50", hidden.has(row.id) && "text-muted-foreground")}>
			<GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-muted-foreground/60" />
			<span className={cn("flex size-5 shrink-0 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4", hidden.has(row.id) && "opacity-50")}>
				{row.lab ? <ModelLogo model={{ id: `${row.lab}/model`, name: row.label, organisationId: row.lab }} harness="phaseo" /> : <HarnessLogo harness={row.id as Harness} />}
			</span>
			<span className="min-w-0 flex-1 truncate text-[13px]">{row.label}</span>
			<span className="flex opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
				<button type="button" aria-label={`Move ${row.label} up`} disabled={index === 0} onClick={() => place(row.id, index - 1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ChevronUp className="size-4" /></button>
				<button type="button" aria-label={`Move ${row.label} down`} disabled={index === ordered.length - 1} onClick={() => place(row.id, index + 1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ChevronDown className="size-4" /></button>
			</span>
			<Switch size="sm" aria-label={`Show ${row.label}`} checked={!hidden.has(row.id)} onCheckedChange={on => toggle(row.id, on)} />
		</div>)}
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
	return <SettingsSection title="Model picker" description="The groups down the picker's left. Switch one off to hide it and its models; drag or use the arrows to reorder."
		action={changed ? <SettingsButton variant="ghost" onClick={() => setPrefs(defaultPickerGroups)}><RotateCcw />Reset</SettingsButton> : undefined}>
		<Block title="Agents" rows={agents} prefs={prefs} onChange={setPrefs} />
		<Block title="Phaseo" rows={phaseo} prefs={prefs} onChange={setPrefs} />
		{!agents.length && !phaseo.length && <p className="px-4 py-3 text-[13px] text-muted-foreground">Sign in to Phaseo or connect an agent to choose its groups.</p>}
	</SettingsSection>;
}
