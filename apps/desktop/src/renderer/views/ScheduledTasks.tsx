import { formatDateParts, formatDateTime } from "@phaseo/app-kit/format";
import { useEffect, useState } from "react";
import { CalendarClock, Ellipsis, MessageSquarePlus, Pencil, Play, Plus, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import type { Mission, MissionCommand, MissionSchedule } from "../../shared/missions";
import { scheduleLabel } from "../../shared/missions";
import { errorText, useWorkspace } from "../app/workspace";
import { Select } from "../components/Select";
import { ScrollArea } from "../components/ui/scroll-area";
import { Switch } from "../components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsSection, settingsInput } from "../settings/SettingsLayout";
import { modelName } from "../chat/ModelPicker";
import { cn } from "../lib/utils";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const statusText: Record<Mission["lastStatus"], string> = { never: "Not run yet", running: "Running", completed: "Last run completed", failed: "Last run failed", interrupted: "Last run interrupted", limited: "Last run hit a usage limit" };

/** Scheduled tasks, kept current across the app. Storage still calls them missions. */
export function useScheduledTasks() {
	const api = window.phaseoDesktop?.workspace;
	const [tasks, setTasks] = useState<Mission[]>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.missions().then(values => { if (active) setTasks(values); }, reason => { if (active) setError(errorText(reason)); });
		const unsubscribe = api.onMissionsChange(setTasks);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	return { tasks, setTasks, error, setError };
}

type Draft = { id?: string; title: string; prompt: string; templateTaskId: string; repeat: MissionSchedule["type"]; every: number; unit: "minutes" | "hours"; time: string; weekdays: number[] };
const emptyDraft: Draft = { title: "", prompt: "", templateTaskId: "", repeat: "daily", every: 1, unit: "hours", time: "09:00", weekdays: [] };

function draftFrom(task: Mission): Draft {
	const { schedule } = task;
	const hours = schedule.type === "interval" && schedule.minutes % 60 === 0;
	return { id: task.id, title: task.title, prompt: task.prompt, templateTaskId: task.templateTaskId, repeat: schedule.type,
		every: schedule.type === "interval" ? (hours ? schedule.minutes / 60 : schedule.minutes) : 1, unit: schedule.type === "interval" && !hours ? "minutes" : "hours",
		time: schedule.type === "daily" ? schedule.time : "09:00", weekdays: schedule.type === "daily" ? schedule.weekdays : [] };
}

function ScheduledTaskForm({ draft, setDraft, busy, onSubmit, onCancel }: { draft: Draft; setDraft: (draft: Draft) => void; busy: boolean; onSubmit: () => void; onCancel: () => void }) {
	const { overview } = useWorkspace();
	const templates = overview.tasks.filter(task => !task.archived && !task.missionId && !task.delegation?.parentTaskId && (!task.projectId || overview.projects.some(project => project.id === task.projectId && !project.worktree?.removedAt)));
	const project = (id?: string) => overview.projects.find(value => value.id === id)?.name;
	const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
	return <form aria-label="Scheduled task" className="flex flex-col gap-4 px-4 py-4 [&_[data-slot=select-trigger]]:text-[13px] [&_[data-slot=select-trigger]]:font-normal" onSubmit={event => { event.preventDefault(); if (draft.templateTaskId) onSubmit(); }}>
		<SettingsField label="Name"><input aria-label="Task name" required maxLength={200} value={draft.title} onChange={event => set({ title: event.target.value })} placeholder="Morning dependency check" className={settingsInput} /></SettingsField>
		<SettingsField label="Instructions"><textarea aria-label="Instructions" required maxLength={100000} rows={4} value={draft.prompt} onChange={event => set({ prompt: event.target.value })} placeholder="What should the agent do each time it runs?" className={cn(settingsInput, "h-auto resize-y py-2 leading-relaxed")} /></SettingsField>
		<SettingsField label="Run like" hint="Each run starts a fresh chat with this chat's account, agent, model and project.">
			<Select label="Run like" value={draft.templateTaskId} onValueChange={templateTaskId => set({ templateTaskId })} options={[{ value: "", label: "Choose a chat" }, ...templates.map(task => ({ value: task.id, label: [task.title, modelName(task), project(task.projectId)].filter(Boolean).join(" · ") }))]} />
		</SettingsField>
		<div className="flex flex-wrap items-end gap-3">
			<SettingsField label="Repeat"><Select label="Repeat" value={draft.repeat} onValueChange={repeat => set({ repeat: repeat as Draft["repeat"] })} options={[{ value: "daily", label: "At a time of day" }, { value: "interval", label: "Every few minutes or hours" }]} /></SettingsField>
			{draft.repeat === "interval"
				? <>
					<SettingsField label="Every"><input aria-label="Every" type="number" required min={1} max={draft.unit === "hours" ? 168 : 10080} value={draft.every} onChange={event => set({ every: Number(event.target.value) })} className={cn(settingsInput, "h-9 w-20")} /></SettingsField>
					<div><Select label="Interval unit" value={draft.unit} onValueChange={unit => set({ unit: unit as Draft["unit"] })} options={[{ value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }]} /></div>
				</>
				: <SettingsField label="Time"><input aria-label="Time" type="time" required value={draft.time} onChange={event => set({ time: event.target.value })} className={cn(settingsInput, "h-9 w-32")} /></SettingsField>}
		</div>
		{draft.repeat === "daily" && <fieldset className="flex flex-col gap-1.5">
			<legend className="mb-1.5 text-xs font-medium text-muted-foreground">Days <span className="font-normal">· none selected runs every day, in {Intl.DateTimeFormat().resolvedOptions().timeZone}</span></legend>
			<div className="flex flex-wrap gap-1.5">{days.map((day, index) => {
				const on = draft.weekdays.includes(index);
				return <button key={day} type="button" aria-pressed={on} onClick={() => set({ weekdays: on ? draft.weekdays.filter(value => value !== index) : [...draft.weekdays, index].sort() })}
					className={cn("h-7 w-11 rounded-md border text-xs font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground")}>{day}</button>;
			})}</div>
		</fieldset>}
		{!templates.length && <SettingsNote>Start a chat first. A scheduled task runs like one of your chats.</SettingsNote>}
		<div className="flex items-center gap-2">
			<SettingsButton type="submit" variant="primary" disabled={busy || !draft.templateTaskId}>{draft.id ? "Save changes" : "Create paused"}</SettingsButton>
			<SettingsButton variant="ghost" disabled={busy} onClick={onCancel}>Cancel</SettingsButton>
		</div>
	</form>;
}

function ScheduledTaskRow({ task, busy, run, onEdit }: { task: Mission; busy: boolean; run: (command: MissionCommand) => void; onEdit: () => void }) {
	const { overview, select } = useWorkspace();
	const runs = overview.tasks.filter(value => value.missionId === task.id);
	const running = task.lastStatus === "running";
	const thread = task.threadTaskId ? overview.tasks.find(value => value.id === task.threadTaskId) : undefined;
	const next = task.enabled && task.nextRunAt ? `Next ${formatDateParts(task.nextRunAt, { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : task.enabled ? undefined : "Paused";
	return <article data-scheduled-task={task.id} className="flex flex-col gap-2 px-4 py-3.5">
		<div className="flex items-center gap-4">
			<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><CalendarClock className="size-4" /></span>
			<div className="min-w-0 flex-1">
				<h3 className="truncate text-[13px] font-semibold">{task.title}</h3>
				<p className="mt-0.5 text-xs text-muted-foreground">{[scheduleLabel(task.schedule), next, statusText[task.lastStatus]].filter(Boolean).join(" · ")}</p>
				{task.threadTaskId && <p className="mt-0.5 truncate text-xs text-muted-foreground">Posts in {thread ? <button type="button" className="hover:text-foreground hover:underline" onClick={() => select(thread.id)}>{thread.title}</button> : "a chat that no longer exists"}</p>}
			</div>
			<SettingsButton variant="ghost" disabled={busy || running} onClick={() => run({ type: "run", id: task.id })}><Play className="size-3.5" />Run now</SettingsButton>
			<Switch aria-label={task.enabled ? `Pause ${task.title}` : `Turn on ${task.title}`} checked={task.enabled} disabled={busy} onCheckedChange={enabled => run({ type: "enable", id: task.id, enabled })} />
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${task.title}`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" />}><Ellipsis className="size-4" /></DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem disabled={running} onClick={onEdit}><Pencil />Edit</DropdownMenuItem>
					{task.threadTaskId && <DropdownMenuItem disabled={running} onClick={() => run({ type: "save", id: task.id, title: task.title, prompt: task.prompt, templateTaskId: task.templateTaskId, threadTaskId: null, schedule: task.schedule })}><MessageSquarePlus />Start a new chat each run</DropdownMenuItem>}
					{task.lastTaskId && <DropdownMenuItem onClick={() => select(task.lastTaskId)}><SquareArrowOutUpRight />Open latest run</DropdownMenuItem>}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" disabled={running} onClick={() => run({ type: "delete", id: task.id })}><Trash2 />Delete</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
		{task.error && <p role="alert" className="ml-12 text-xs text-destructive">{task.error}</p>}
		{runs.length > 0 && <details className="ml-11 text-xs text-muted-foreground">
			<summary className="w-fit hover:text-foreground">{runs.length === 1 ? "1 run" : `${runs.length} runs`}</summary>
			<div className="mt-1 ml-5 flex flex-col">{runs.map(value => <button key={value.id} type="button" onClick={() => select(value.id)} className="flex h-7 items-center justify-between gap-3 rounded-md px-2 -mx-2 text-left hover:bg-muted hover:text-foreground">
				<span>{formatDateTime(value.createdAt)}</span><span className="capitalize">{value.status}</span>
			</button>)}</div>
		</details>}
	</article>;
}

export function ScheduledTasks() {
	const api = window.phaseoDesktop?.workspace;
	const { tasks, setTasks, error, setError } = useScheduledTasks();
	const [draft, setDraft] = useState<Draft>();
	const [busy, setBusy] = useState(false);
	async function run(value: MissionCommand) {
		if (!api) return false;
		setBusy(true); setError("");
		try { setTasks(await api.mission(value)); return true; }
		catch (reason) { setError(errorText(reason)); return false; }
		finally { setBusy(false); }
	}
	function save() {
		if (!draft) return;
		const minutes = draft.unit === "hours" ? draft.every * 60 : draft.every;
		const schedule: MissionSchedule = draft.repeat === "interval" ? { type: "interval", minutes } : { type: "daily", time: draft.time, weekdays: draft.weekdays };
		void run({ type: "save", ...(draft.id ? { id: draft.id } : {}), title: draft.title, prompt: draft.prompt, templateTaskId: draft.templateTaskId, schedule }).then(saved => { if (saved) setDraft(undefined); });
	}
	const form = draft && <ScheduledTaskForm draft={draft} setDraft={setDraft} busy={busy} onSubmit={save} onCancel={() => setDraft(undefined)} />;
	return <ScrollArea className="h-full">
		<SettingsPageLayout title="Scheduled tasks" description="Chats that start themselves on a schedule while Phaseo is open. Missed runs are skipped."
			actions={!draft && <SettingsButton variant="primary" onClick={() => setDraft(emptyDraft)}><Plus className="size-3.5" />New scheduled task</SettingsButton>}>
			{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
			{draft && !draft.id && <SettingsSection title="New scheduled task">{form}</SettingsSection>}
			{(tasks.length > 0 || !draft) && <SettingsSection title={tasks.length ? "Your scheduled tasks" : "No scheduled tasks yet"} label="Your scheduled tasks" description={tasks.length ? undefined : "Agents can also schedule tasks for you from a chat."}>
				{tasks.length ? tasks.map(task => draft?.id === task.id
					? <div key={task.id}><h3 className="px-4 pt-3.5 text-[13px] font-semibold">Edit {task.title}</h3>{form}</div>
					: <ScheduledTaskRow key={task.id} task={task} busy={busy} run={value => void run(value)} onEdit={() => setDraft(draftFrom(task))} />)
					: <button type="button" onClick={() => setDraft(emptyDraft)} className="flex items-center gap-2 px-4 py-3.5 text-left text-[13px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"><Plus className="size-4" />Schedule a chat to run every morning, every hour, or on chosen days</button>}
			</SettingsSection>}
		</SettingsPageLayout>
	</ScrollArea>;
}
