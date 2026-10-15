import { useState } from "react";
import { AlarmClock, AlarmClockOff, Archive, CircleCheck, Clock, Copy, Filter, Mail, Pencil, Pin, PinOff, Sparkles, Undo2 } from "lucide-react";
import { hasWoken, isSettled, isSnoozed, settleBlocker, snoozeBlocker, snoozePresets } from "../../shared/threadLifecycle";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { useWorkspace } from "../app/workspace";
import { TagMenu } from "../components/Tags";
import { Select } from "../components/Select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "../components/ui/dropdown-menu";
import { SettingsButton, settingsInput } from "../settings/SettingsLayout";
import { cn } from "../lib/utils";
import { codeSections, nextAfterParking } from "./codeThreads";
import { offerUndo } from "./threadUndo";

export const snoozeTime = (date: Date) => date.toLocaleString(undefined, { weekday: date.getDate() === new Date().getDate() ? undefined : "short", hour: "numeric", minute: "2-digit" });

/** Settle, snooze, pin and read actions for Code chats, with undo and "open the next chat" as in T3 Code. */
export function useThreadActions() {
	const { overview, command, selectedId, select, setNewChatProjectId } = useWorkspace();
	const run = (value: Parameters<typeof command>[0]) => command(value);
	// Parking the open chat opens the next one in the list, or a new chat in the same project.
	const moveOn = (task: TaskOverview, scope: string) => {
		if (task.id !== selectedId) return;
		const next = nextAfterParking(codeSections(overview.tasks, overview.projects, scope), task.id);
		if (next) select(next.id); else { setNewChatProjectId(task.projectId ?? ""); select(undefined); }
	};
	return {
		settle: async (task: TaskOverview, scope = "") => {
			const blocked = settleBlocker(task); if (blocked) { await run({ type: "settle", id: task.id }); return; }
			const wasPinned = task.pinned, wasSnoozed = task.snoozedUntil;
			moveOn(task, scope);
			if (!await run({ type: "settle", id: task.id })) return;
			offerUndo("Settled", async () => {
				await run({ type: "unsettle", id: task.id });
				if (wasPinned) await run({ type: "update-task", id: task.id, pinned: true });
				if (wasSnoozed && Date.parse(wasSnoozed) > Date.now()) await run({ type: "snooze", id: task.id, until: wasSnoozed });
			});
		},
		unsettle: (task: TaskOverview) => run({ type: "unsettle", id: task.id }),
		snooze: async (task: TaskOverview, until: Date, scope = "") => {
			moveOn(task, scope);
			if (await run({ type: "snooze", id: task.id, until: until.toISOString() })) offerUndo("Snoozed", () => run({ type: "wake", id: task.id }));
		},
		wake: (task: TaskOverview) => run({ type: "wake", id: task.id }),
		pin: async (task: TaskOverview) => {
			if (!await run({ type: "update-task", id: task.id, pinned: !task.pinned })) return;
			if (task.pinned) offerUndo("Unpinned", () => run({ type: "update-task", id: task.id, pinned: true }));
		},
		archive: async (task: TaskOverview, scope = "") => {
			moveOn(task, scope);
			if (await run({ type: "update-task", id: task.id, archived: true })) offerUndo("Archived", () => run({ type: "update-task", id: task.id, archived: false }));
		},
		markUnread: (task: TaskOverview) => run({ type: "mark-unread", id: task.id }),
		autoSettle: (task: TaskOverview, enabled: boolean) => run({ type: "auto-settle", id: task.id, enabled }),
	};
}

/** The snooze choices as menu items, then Custom… */
export function SnoozeItems({ onSnooze, onCustom }: { onSnooze: (until: Date) => void; onCustom: () => void }) {
	return <>
		{snoozePresets().map(preset => <DropdownMenuItem key={preset.label} onClick={() => onSnooze(preset.until)}>{preset.label}<span className="ml-auto pl-4 text-xs text-muted-foreground">{snoozeTime(preset.until)}</span></DropdownMenuItem>)}
		<DropdownMenuSeparator />
		<DropdownMenuItem onClick={onCustom}>Custom…</DropdownMenuItem>
	</>;
}

/** T3's custom snooze: a date and time, or a duration from now. */
export function CustomSnoozeDialog({ open, onOpenChange, onSnooze }: { open: boolean; onOpenChange: (open: boolean) => void; onSnooze: (until: Date) => void }) {
	const [mode, setMode] = useState<"date" | "duration">("date");
	const local = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
	const [when, setWhen] = useState(() => local(new Date(Date.now() + 2 * 3_600_000)));
	const [amount, setAmount] = useState(2);
	const [unit, setUnit] = useState<"minutes" | "hours" | "days">("hours");
	const until = mode === "date" ? new Date(when) : new Date(Date.now() + amount * { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[unit]);
	const valid = !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
	return <Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="sm:max-w-sm">
			<DialogHeader><DialogTitle>Custom snooze</DialogTitle><DialogDescription>Choose when snoozed chats return to your list.</DialogDescription></DialogHeader>
			<div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs font-medium">{(["date", "duration"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={cn("h-7 flex-1 rounded-md", mode === value ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}>{value === "date" ? "Date and time" : "Duration"}</button>)}</div>
			{mode === "date"
				? <input type="datetime-local" aria-label="Snooze until" value={when} min={local(new Date())} onChange={event => setWhen(event.target.value)} className={cn(settingsInput, "h-9")} />
				: <div className="flex gap-2"><input type="number" aria-label="Snooze for" min={1} max={999} value={amount} onChange={event => setAmount(Number(event.target.value))} className={cn(settingsInput, "h-9 w-24")} />
					<div className="flex-1"><Select label="Snooze unit" value={unit} onValueChange={value => setUnit(value as typeof unit)} options={[{ value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }, { value: "days", label: "Days" }]} /></div></div>}
			<DialogFooter><SettingsButton variant="ghost" onClick={() => onOpenChange(false)}>Cancel</SettingsButton><SettingsButton variant="primary" disabled={!valid} onClick={() => { onSnooze(until); onOpenChange(false); }}>Snooze</SettingsButton></DialogFooter>
		</DialogContent>
	</Dialog>;
}

/** T3's chat menu, in its order: pin, settle, snooze; rename, tags, unread, project filter, auto-settle; copy; archive. */
export function ThreadMenuItems({ task, scope, onScope, onRename, onCustomSnooze }: { task: TaskOverview; scope?: string; onScope?: (id: string) => void; onRename?: () => void; onCustomSnooze: () => void }) {
	const actions = useThreadActions();
	const { overview } = useWorkspace();
	const project = overview.projects.find(value => value.id === task.projectId);
	const settled = isSettled(task), snoozed = isSnoozed(task), woke = hasWoken(task);
	const copy = (text: string) => void navigator.clipboard.writeText(text);
	return <>
		<DropdownMenuItem onClick={() => void actions.pin(task)}>{task.pinned ? <PinOff /> : <Pin />}{task.pinned ? "Unpin chat" : "Pin chat"}</DropdownMenuItem>
		{settled
			? <DropdownMenuItem onClick={() => void actions.unsettle(task)}><Undo2 />Un-settle chat</DropdownMenuItem>
			: <DropdownMenuItem disabled={Boolean(settleBlocker(task))} onClick={() => void actions.settle(task, scope)}><CircleCheck />Settle chat</DropdownMenuItem>}
		{snoozed || woke
			? <DropdownMenuItem onClick={() => void actions.wake(task)}>{snoozed ? <AlarmClockOff /> : <AlarmClock />}{snoozed ? "Wake chat" : "Dismiss wake"}</DropdownMenuItem>
			: <DropdownMenuSub>
				<DropdownMenuSubTrigger disabled={Boolean(snoozeBlocker(task, new Date(Date.now() + 60_000).toISOString()))}><Clock />Snooze</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className="w-56"><SnoozeItems onSnooze={until => void actions.snooze(task, until, scope)} onCustom={onCustomSnooze} /></DropdownMenuSubContent>
			</DropdownMenuSub>}
		<DropdownMenuSeparator />
		{onRename && <DropdownMenuItem onClick={onRename}><Pencil />Rename chat</DropdownMenuItem>}
		<TagMenu task={task} />
		<DropdownMenuItem disabled={!task.lastCompletedAt} onClick={() => void actions.markUnread(task)}><Mail />Mark unread</DropdownMenuItem>
		{onScope && project && <DropdownMenuItem onClick={() => onScope(scope ? "" : project.id)}><Filter />{scope ? "Show all projects" : `Filter by ${project.name}`}</DropdownMenuItem>}
		<DropdownMenuSub>
			<DropdownMenuSubTrigger><Sparkles />Auto-settle behaviour</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-40">
				<DropdownMenuCheckboxItem checked={task.autoSettle !== false} onCheckedChange={() => void actions.autoSettle(task, true)}>Enabled</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem checked={task.autoSettle === false} onCheckedChange={() => void actions.autoSettle(task, false)}>Disabled</DropdownMenuCheckboxItem>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
		<DropdownMenuSeparator />
		<DropdownMenuSub>
			<DropdownMenuSubTrigger><Copy />Copy</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-40">
				{project && <DropdownMenuItem onClick={() => copy(project.directory)}>Path</DropdownMenuItem>}
				{project?.worktree && <DropdownMenuItem onClick={() => copy(project.worktree!.branch)}>Branch</DropdownMenuItem>}
				<DropdownMenuItem onClick={() => copy(task.id)}>Chat ID</DropdownMenuItem>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
		<DropdownMenuSeparator />
		<DropdownMenuItem disabled={["running", "waiting"].includes(task.status)} onClick={() => void actions.archive(task, scope)}><Archive />Archive chat</DropdownMenuItem>
	</>;
}
