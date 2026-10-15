import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Ellipsis, FileJson, Plus, Search, TriangleAlert, X } from "lucide-react";
import { commandLabel, keybindingCommands, keybindingConflicts, keybindingGroups, keyFromEvent, keyLabel, keyParts, replaceCommandBindings, whenError, whenVariables, type KeybindingCommand, type KeybindingEntry, type KeybindingRow } from "../../shared/keybindings";
import { errorText } from "../app/workspace";
import { Select } from "../components/Select";
import { Kbd, KbdGroup } from "../components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { saveKeybindings, useKeybindings } from "../lib/keybindings";
import { isMac } from "../lib/shortcuts";
import { cn } from "../lib/utils";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

function KeyPill({ value }: { value: string }) {
	return <KbdGroup>{keyParts(value, isMac()).map((part, index) => <Kbd key={index}>{part}</Kbd>)}</KbdGroup>;
}

/** Records the next key combination. Escape cancels; Backspace on its own clears the binding. */
function KeyCapture({ label, value, onCapture, onCancel, className, autoFocus }: { label: string; value: string; onCapture: (key: string) => void; onCancel?: () => void; className?: string; autoFocus?: boolean }) {
	const [recording, setRecording] = useState(false);
	const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Tab") return;
		event.preventDefault(); event.stopPropagation();
		if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) { onCancel?.(); event.currentTarget.blur(); return; }
		if ((event.key === "Backspace" || event.key === "Delete") && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) { onCapture(""); return; }
		const key = keyFromEvent(event.nativeEvent, isMac());
		if (key) onCapture(key);
	};
	return <input data-keybinding-capture="" autoFocus={autoFocus} aria-label={`Keybinding for ${label}`} readOnly value={recording && !value ? "" : value ? keyLabel(value, isMac()) : ""} placeholder={recording ? "Press shortcut" : "Unassigned"}
		onFocus={() => setRecording(true)} onBlur={() => setRecording(false)} onKeyDown={onKeyDown}
		className={cn(settingsInput, "h-7 w-44 font-mono text-xs caret-transparent", className)} />;
}

/** The when clause, shown quietly; opens an editor that checks the expression as you type. */
function WhenControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	const [draft, setDraft] = useState(value);
	const problem = whenError(draft);
	return <Popover onOpenChange={open => { if (open) setDraft(value); else if (!whenError(draft) && draft.trim() !== value) onChange(draft.trim()); }}>
		<PopoverTrigger render={<button type="button" aria-label={`Edit when clause for ${label}`} className="flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 font-mono text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground" />}>
			<span className="truncate">{value || "Always"}</span>
		</PopoverTrigger>
		<PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] gap-3 p-3">
			<div className="text-sm font-medium">When</div>
			<input aria-label="When expression" value={draft} placeholder="Always" onChange={event => setDraft(event.target.value)} onKeyDown={event => event.stopPropagation()} className={cn(settingsInput, "font-mono text-xs", problem && "border-destructive")} />
			{problem ? <p className="text-xs text-destructive">{problem}</p> : <p className="text-xs text-muted-foreground">Combine conditions with <code>&amp;&amp;</code>, <code>||</code>, <code>!</code> and brackets. Leave empty for always.</p>}
			<div className="flex flex-col gap-0.5">{Object.entries(whenVariables).map(([name, description]) => <button key={name} type="button" onClick={() => setDraft(current => current.trim() ? `${current.trim()} && ${name}` : name)}
				className="flex items-baseline gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted"><code className="shrink-0 font-mono text-foreground">{name}</code><span className="truncate text-muted-foreground">{description}</span></button>)}</div>
		</PopoverContent>
	</Popover>;
}

function Conflict({ labels }: { labels: string[] }) {
	if (!labels.length) return null;
	const text = `Also bound to ${labels.join(", ")}`;
	return <span role="img" aria-label={text} title={text} className="grid size-6 place-items-center text-warning"><TriangleAlert className="size-3.5" /></span>;
}

type Actions = { rows: KeybindingRow[]; entries: KeybindingEntry[]; save: (entries: KeybindingEntry[]) => void; busy: boolean };
const commandEntries = (rows: KeybindingRow[], command: KeybindingCommand) => rows.filter(row => row.command === command && row.key).map(({ command: name, key, when }) => ({ command: name, key, ...(when ? { when } : {}) }));

function ShortcutRow({ row, actions }: { row: KeybindingRow; actions: Actions }) {
	const [editing, setEditing] = useState(false);
	const [key, setKey] = useState(row.key);
	const dirty = key !== row.key;
	const replaceWith = (next: Partial<KeybindingEntry>) => {
		const mine = actions.rows.filter(value => value.command === row.command);
		const list = mine.map(value => value.id === row.id ? { command: row.command, key: next.key ?? row.key, ...((next.when ?? row.when) ? { when: next.when ?? row.when } : {}) } : { command: value.command, key: value.key, ...(value.when ? { when: value.when } : {}) }).filter(value => value.key || mine.length === 1);
		actions.save(replaceCommandBindings(actions.entries, row.command, list));
	};
	const remove = () => {
		const rest = commandEntries(actions.rows.filter(value => value.id !== row.id), row.command);
		actions.save(replaceCommandBindings(actions.entries, row.command, rest.length ? rest : [{ command: row.command, key: "" }]));
	};
	const conflicts = keybindingConflicts(actions.rows, { ...row, key });
	return <SettingsRow className="group/row"
		title={<span className="flex items-center gap-2" title={row.command}>{row.label}{row.source === "Custom" && <span className="rounded-full border border-border px-1.5 text-[10.5px] font-medium text-muted-foreground">Custom</span>}</span>}
		description={<span className="flex h-6 items-center gap-1"><span className="text-xs text-muted-foreground/70">When</span><WhenControl label={row.label} value={row.when ?? ""} onChange={when => replaceWith({ when })} /></span>}
		control={<div className="flex items-center justify-end gap-1.5">
			<Conflict labels={conflicts} />
			{(row.source === "Custom" || row.key) && <span className="flex items-center opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-data-popup-open:opacity-100">
				<DropdownMenu>
					<DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${row.label}`} disabled={actions.busy} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" />}><Ellipsis className="size-3.5" /></DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-44">
						{row.source === "Custom" && <DropdownMenuItem onClick={() => actions.save(replaceCommandBindings(actions.entries, row.command, []))}>Reset to default</DropdownMenuItem>}
						{row.key && <DropdownMenuItem variant="destructive" onClick={remove}>Remove</DropdownMenuItem>}
					</DropdownMenuContent>
				</DropdownMenu>
			</span>}
			{dirty && <SettingsButton variant="primary" disabled={actions.busy} onClick={() => { replaceWith({ key }); setEditing(false); }}>Save</SettingsButton>}
			{editing || dirty || !row.key
				? <KeyCapture label={row.label} value={key} autoFocus={editing} onCapture={setKey} onCancel={() => { setKey(row.key); setEditing(false); }} />
				: <button type="button" onClick={() => setEditing(true)} aria-label={`Edit shortcut for ${row.label}: ${keyLabel(row.key, isMac())}`}
					className="-mr-1.5 inline-flex h-7 items-center rounded-md border border-transparent px-1.5 outline-none transition-colors hover:border-border/70 hover:bg-accent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"><KeyPill value={row.key} /></button>}
		</div>} />;
}

function NewShortcut({ actions, onDone }: { actions: Actions; onDone: () => void }) {
	const [command, setCommand] = useState<KeybindingCommand>(keybindingCommands[0].command);
	const [key, setKey] = useState("");
	const [when, setWhen] = useState("");
	const conflicts = keybindingConflicts(actions.rows, { id: "new", command, key, when });
	return <SettingsRow className="bg-muted/15" title="New keybinding"
		description={<span className="flex h-6 items-center gap-1"><span className="text-xs text-muted-foreground/70">When</span><WhenControl label="the new keybinding" value={when} onChange={setWhen} /></span>}
		control={<div className="flex flex-wrap items-center justify-end gap-1.5">
			<div className="w-52"><Select label="Command" value={command} onValueChange={value => setCommand(value as KeybindingCommand)} options={keybindingCommands.map(value => ({ value: value.command, label: value.label }))} /></div>
			<Conflict labels={conflicts} />
			<KeyCapture label={commandLabel(command)} value={key} onCapture={setKey} />
			<SettingsButton variant="primary" disabled={!key || actions.busy} onClick={() => { actions.save(replaceCommandBindings(actions.entries, command, [...commandEntries(actions.rows, command), { command, key, ...(when ? { when } : {}) }])); onDone(); }}>Save</SettingsButton>
			<button type="button" aria-label="Cancel new keybinding" onClick={onDone} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
		</div>} />;
}

export function KeyboardShortcuts() {
	const state = useKeybindings();
	const [query, setQuery] = useState("");
	const [adding, setAdding] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const save = (entries: KeybindingEntry[]) => { setBusy(true); setError(""); void saveKeybindings(entries).catch(reason => setError(errorText(reason))).finally(() => setBusy(false)); };
	const actions: Actions = { rows: state.rows, entries: state.entries, save, busy };
	const needle = query.trim().toLowerCase();
	const rows = useMemo(() => state.rows.filter(row => !needle || `${row.label} ${row.command} ${row.key ? keyLabel(row.key, isMac()) : "unassigned"} ${row.when ?? ""}`.toLowerCase().includes(needle)), [state.rows, needle]);
	return <SettingsPageLayout title="Keyboard shortcuts" description="Click a shortcut and press new keys to change it. Your changes are saved in keybindings.json, which you can also edit by hand.">
		<div role="search" aria-label="Find and add shortcuts" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3">
				<label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background/40 px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
					<Search className="size-3.5 shrink-0" />
					<input aria-label="Search keybindings" placeholder="Search keybindings" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70" />
				</label>
				<SettingsButton disabled={adding} onClick={() => setAdding(true)}><Plus className="size-3.5" />Add keybinding</SettingsButton>
				<button type="button" aria-label="Open keybindings.json" title="Open keybindings.json" onClick={() => void window.phaseoDesktop?.keybindings.open().catch(reason => setError(errorText(reason)))}
					className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"><FileJson className="size-4" /></button>
		</div>
		{state.error && <SettingsNote tone="error" role="alert">keybindings.json has a problem, so the defaults are in use: {state.error}</SettingsNote>}
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
		{adding && <SettingsSection title="New keybinding" label="New keybinding"><NewShortcut actions={actions} onDone={() => setAdding(false)} /></SettingsSection>}
		{rows.length ? keybindingGroups.map(group => {
			const members = rows.filter(row => row.group === group);
			return members.length ? <SettingsSection key={group} title={group}>{members.map(row => <ShortcutRow key={`${row.id}:${row.key}:${row.when ?? ""}`} row={row} actions={actions} />)}</SettingsSection> : null;
		}) : <SettingsSection title="Shortcuts" label="No matches"><div className="px-4 py-12 text-center text-sm text-muted-foreground">No keybindings match your search.</div></SettingsSection>}
	</SettingsPageLayout>;
}
