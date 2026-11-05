import { formatDateTime } from "@phaseo/app-kit/format";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { WorkspacePreferences } from "../../shared/preferences";
import { defaultSnoozePresets, snoozePresetDays, snoozePresetId, snoozePresetLimits, type IdleCompactionMode, type ResponseStreamingMode, type SnoozePreset, type SnoozePresetDay, type ThreadPreferences } from "../../shared/threadPreferences";
import { resolveSnoozePreset, snoozePresets } from "../../shared/threadLifecycle";
import type { RetentionKind, RetentionPreview, RetentionReport, StorageUsage } from "../../shared/maintenance";
import { errorText, useWorkspace } from "../app/workspace";
import { Select } from "../components/Select";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { projectFoldersKey, workingSectionKey } from "../shell/codeThreads";
import { snoozeTime } from "../shell/threadActions";
import { formatBytes } from "./diagnosticsFormat";
import { usePreferences } from "./GeneralSettings";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

type Save = (value: WorkspacePreferences) => Promise<void>;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Search words for Settings → Threads. */
export const threadSettingsKeywords = "threads chats usage limits quota rate limit reset resume auto-resume continue snooze until reset wake snooze options presets times later this evening tomorrow next week remind code chats working section group by project folders auto-settle settle merged pull request inactive compact compaction idle context prompt cache tokens summary response streaming stream tokens paragraph wait full response turn live";

const compactionLabels: Record<IdleCompactionMode, string> = { off: "Never", onReturn: "When you return", beforeCacheExpires: "Before the cache expires" };
const compactionDescriptions: Record<IdleCompactionMode, string> = {
	off: "Large chats are compacted only when the agent runs out of room, or when you ask.",
	onReturn: "When you write to a large chat (over 100,000 tokens) after more than 5 minutes, it is compacted first, so later turns send a summary instead of the whole history. The summary is a paid request; it pays off over the turns that follow.",
	beforeCacheExpires: "A large chat (over 100,000 tokens) left idle is compacted in the minute before its prompt cache expires, while reading the history is still cheap. Each compaction is a paid request, so this costs more for chats you never come back to.",
};
const streamingLabels: Record<ResponseStreamingMode, string> = { live: "As it is written", paragraph: "Show finished paragraphs", turn: "Wait for the full response" };
const streamingDescriptions: Record<ResponseStreamingMode, string> = { live: "Text appears word by word as the agent writes it.", paragraph: "Each paragraph or code block appears as soon as it is complete.", turn: "Text appears once the agent finishes its turn." };

/** Settings → Threads: usage limits, snooze options, Code chats, idle compaction and response streaming. */
export function ThreadSettings() {
	const { preferences, loading, busy, error, save, ready } = usePreferences();
	const disabled = !ready || busy, threads = preferences.threads;
	const set = (patch: Partial<ThreadPreferences>) => void save({ ...preferences, threads: { ...threads, ...patch } });
	const status = (loading || error) && <SettingsNote tone={error ? "error" : "muted"} role={error ? "alert" : "status"}>{error || "Loading settings…"}</SettingsNote>;
	return <SettingsPageLayout title="Threads">
		<SettingsSection title="Usage limits" description="For Claude and Codex chats that stop because their plan hit a usage limit. A chat only ever continues on its own agent and login; moving it elsewhere is always your choice." label="Usage limits">
			<SettingsRow title="Resume after usage limits" description="Continue a limited chat a minute after its limit resets. You can cancel this in each chat."
				control={<Switch aria-label="Resume after usage limits" disabled={disabled} checked={threads.autoResumeLimited} onCheckedChange={value => set({ autoResumeLimited: value })} />} />
			<SettingsRow title="Snooze until limits reset" description="Move a limited chat to Snoozed until its limit resets. Turn on Resume after usage limits to continue it then."
				control={<Switch aria-label="Snooze until limits reset" disabled={disabled} checked={threads.snoozeLimited} onCheckedChange={value => set({ snoozeLimited: value })} />} />
			{status}
		</SettingsSection>
		<SnoozeOptions threads={threads} set={set} disabled={disabled} />
		<CodeChats preferences={preferences} save={save} disabled={disabled} />
		<SettingsSection title="Context and responses" label="Context and responses">
			<SettingsRow title="Compact idle chats" description={compactionDescriptions[threads.idleCompaction]}
				control={<Select label="Compact idle chats" disabled={disabled} value={threads.idleCompaction} onValueChange={value => set({ idleCompaction: value as IdleCompactionMode })} options={(["off", "onReturn", "beforeCacheExpires"] as const).map(value => ({ value, label: compactionLabels[value] }))} />} />
			<SettingsRow title="Response streaming" description={streamingDescriptions[threads.responseStreaming]}
				control={<Select label="Response streaming" disabled={disabled} value={threads.responseStreaming} onValueChange={value => set({ responseStreaming: value as ResponseStreamingMode })} options={(["live", "paragraph", "turn"] as const).map(value => ({ value, label: streamingLabels[value] }))} />} />
		</SettingsSection>
	</SettingsPageLayout>;
}

/** Moved from General: how Code chats are listed, and the auto-settle rules. */
function CodeChats({ preferences, save, disabled }: { preferences: WorkspacePreferences; save: Save; disabled: boolean }) {
	const [workingSection, setWorkingSection] = usePersistedState(workingSectionKey, false);
	const [projectFolders, setProjectFolders] = usePersistedState(projectFoldersKey, false);
	return <SettingsSection title="Code chats" description="Settle a chat when you are done with it; it moves to Settled at the bottom of the sidebar. Each project can change these in its Project settings." label="Code chats">
		<SettingsRow title="Show a Working section" description="Fold chats that are working and need nothing from you into a Working section above Snoozed. They return to the top of the list when they need you. Your list is then ordered by time."
			control={<Switch aria-label="Show a Working section" checked={workingSection} onCheckedChange={setWorkingSection} />} />
		<SettingsRow title="Group chats by project" description="Put active chats in a folder per project, on two lines each, with the project you wrote to last on top. Folders collapse, and projects with no active chats have none. Pinned chats stay above them."
			control={<Switch aria-label="Group chats by project" checked={projectFolders} onCheckedChange={setProjectFolders} />} />
		<SettingsRow title="Auto-settle merged chats" description="Settle a chat when its pull request merges. Closed pull requests still settle it."
			control={<Switch aria-label="Auto-settle merged chats" disabled={disabled} checked={preferences.autoSettleOnMerge} onCheckedChange={value => void save({ ...preferences, autoSettleOnMerge: value })} />} />
		<SettingsRow title="Keep chats with a pull request" description="Inactivity does not settle chats with a pull request. Merging and closing still do."
			control={<Switch aria-label="Keep chats with a pull request" disabled={disabled} checked={preferences.keepPullRequests} onCheckedChange={value => void save({ ...preferences, keepPullRequests: value })} />} />
		<SettingsRow title="Auto-settle inactive chats" description="Code chats with no activity for this long settle automatically. Any new activity un-settles a chat."
			control={<Select label="Auto-settle inactive chats" disabled={disabled} value={String(preferences.autoSettleAfterDays ?? "never")}
				onValueChange={value => void save({ ...preferences, autoSettleAfterDays: value === "never" ? null : Number(value) })}
				options={[{ value: "never", label: "Never" }, ...[...new Set([1, 2, 3, 5, 7, 14, 30, ...(preferences.autoSettleAfterDays ? [preferences.autoSettleAfterDays] : [])])].sort((a, b) => a - b).map(days => ({ value: String(days), label: days === 1 ? "After 1 day" : `After ${days} days` }))]} />} />
	</SettingsSection>;
}

const units = { minutes: 1, hours: 60, days: 1440 } as const;
type Unit = keyof typeof units;
const split = (minutes: number): { amount: number; unit: Unit } => minutes % 1440 === 0 ? { amount: minutes / 1440, unit: "days" } : minutes % 60 === 0 ? { amount: minutes / 60, unit: "hours" } : { amount: minutes, unit: "minutes" };
const dayLabels: Record<string, string> = { after: "In", today: "Today", tomorrow: "Tomorrow", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
/** Offered in turn by Add option, skipping any already listed. */
const candidates: SnoozePreset[] = [...defaultSnoozePresets, { kind: "after", minutes: 30 }, { kind: "at", day: "saturday", time: "09:00" }, { kind: "after", minutes: 1440 }];

/** What each option shows in the menu right now, or why it does not appear. */
function snoozePreview(presets: SnoozePreset[], now: Date) {
	const shown = new Set(snoozePresets(now, presets).map(value => value.id)), seen = new Set<string>();
	return presets.map(preset => {
		const resolved = resolveSnoozePreset(preset, now), id = snoozePresetId(preset);
		if (!resolved) return "Left out when less than an hour away";
		if (seen.has(id)) return "Same as an option above";
		seen.add(id);
		return shown.has(id) ? `${resolved.label} · ${snoozeTime(resolved.until)}` : "Same time as another option";
	});
}

/** The snooze menu's choices: durations from now or times on a day. The menu lists them soonest first. */
function SnoozeOptions({ threads, set, disabled }: { threads: ThreadPreferences; set: (patch: Partial<ThreadPreferences>) => void; disabled: boolean }) {
	const presets = threads.snoozePresets, now = new Date(), previews = snoozePreview(presets, now);
	const replace = (index: number, next: SnoozePreset) => set({ snoozePresets: presets.map((preset, at) => at === index ? next : preset) });
	const used = new Set(presets.map(snoozePresetId));
	const sameAsDefault = presets.length === defaultSnoozePresets.length && presets.every((preset, index) => snoozePresetId(preset) === snoozePresetId(defaultSnoozePresets[index]));
	return <SettingsSection title="Snooze options" description="The choices in every snooze menu, listed soonest first. A weekday means the next one after today." label="Snooze options"
		action={!sameAsDefault && <SettingsButton variant="ghost" disabled={disabled} onClick={() => set({ snoozePresets: defaultSnoozePresets })}>Reset</SettingsButton>}>
		{presets.map((preset, index) => <div key={`${index}:${snoozePresetId(preset)}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
			<div className="w-32"><Select label={`Snooze option ${index + 1}`} disabled={disabled} value={preset.kind === "after" ? "after" : preset.day}
				onValueChange={value => replace(index, value === "after" ? { kind: "after", minutes: preset.kind === "after" ? preset.minutes : 60 } : { kind: "at", day: value as SnoozePresetDay, time: preset.kind === "at" ? preset.time : "09:00" })}
				options={["after", ...snoozePresetDays].map(value => ({ value, label: dayLabels[value] }))} /></div>
			{preset.kind === "after" ? <SnoozeDuration minutes={preset.minutes} disabled={disabled} label={`Snooze option ${index + 1} duration`} onChange={minutes => replace(index, { kind: "after", minutes })} />
				: <input type="time" aria-label={`Snooze option ${index + 1} time`} disabled={disabled} key={preset.time} defaultValue={preset.time} className={cn(settingsInput, "w-28")}
					onBlur={event => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(event.target.value) && event.target.value !== preset.time) replace(index, { ...preset, time: event.target.value }); else event.target.value = preset.time; }} />}
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{previews[index]}</span>
			<SettingsButton variant="ghost" disabled={disabled || presets.length <= 1} title="Remove this option" onClick={() => set({ snoozePresets: presets.filter((_, at) => at !== index) })}><X /><span className="sr-only">Remove snooze option {index + 1}</span></SettingsButton>
		</div>)}
		<div className="flex items-center gap-3 px-4 py-2.5">
			<SettingsButton disabled={disabled || presets.length >= snoozePresetLimits.maximum} onClick={() => set({ snoozePresets: [...presets, candidates.find(candidate => !used.has(snoozePresetId(candidate))) ?? { kind: "after", minutes: 120 }] })}><Plus />Add option</SettingsButton>
			{presets.length >= snoozePresetLimits.maximum && <span className="text-xs text-muted-foreground">Up to {snoozePresetLimits.maximum} options.</span>}
		</div>
	</SettingsSection>;
}

/** A duration as an amount and a unit; saved when the amount loses focus. */
function SnoozeDuration({ minutes, disabled, label, onChange }: { minutes: number; disabled: boolean; label: string; onChange: (minutes: number) => void }) {
	const { amount, unit } = split(minutes);
	const commit = (next: number, nextUnit: Unit) => { const total = Math.round(next) * units[nextUnit]; if (Number.isFinite(total) && total >= 1 && total <= snoozePresetLimits.maximumMinutes && total !== minutes) onChange(total); return total >= 1 && total <= snoozePresetLimits.maximumMinutes; };
	return <div className="flex items-center gap-2">
		<input type="number" min={1} step={1} aria-label={label} disabled={disabled} key={minutes} defaultValue={amount} className={cn(settingsInput, "w-20 text-right")}
			onBlur={event => { if (!commit(Number(event.target.value), unit)) event.target.value = String(amount); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
		<div className="w-28"><Select label={`${label} unit`} disabled={disabled} value={unit} onValueChange={value => void commit(amount, value as Unit)} options={(Object.keys(units) as Unit[]).map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></div>
	</div>;
}

/** Search words for Settings → Maintenance. */
export const maintenanceSettingsKeywords = "maintenance updates provider update checks newer versions agent cli codex claude continue chats after restarts resume interrupted quit crash restart storage disk retention delete remove old browser recordings screen recordings logs traces clean up now free space worktree cleanup";

const keepOptions = (current: number | null) => [{ value: "forever", label: "Forever" }, ...[...new Set([7, 14, 30, 60, 90, 180, 365, ...current === null ? [] : [current]])].sort((a, b) => a - b).map(days => ({ value: String(days), label: days === 1 ? "1 day" : `${days} days` }))];
const kindNames: Record<RetentionKind, [string, string]> = { recordings: ["browser recording", "Browser recordings"], logs: ["log file", "Log files"] };

/** "3 browser recordings (120 MB) and 2 log files (20 MB)". */
export function retentionSummary(counts: Record<RetentionKind, { files: number; bytes: number }>) {
	const parts = (Object.keys(kindNames) as RetentionKind[]).filter(kind => counts[kind].files).map(kind => `${plural(counts[kind].files, kindNames[kind][0])} (${formatBytes(counts[kind].bytes)})`);
	return parts.join(" and ");
}

/** Settings → Maintenance: agent update checks, continuing after restarts, and how long recordings and logs are kept. */
export function MaintenanceSettings() {
	const { preferences, loading, busy, error, save, ready } = usePreferences();
	const { openSettings } = useWorkspace();
	const disabled = !ready || busy, threads = preferences.threads;
	const set = (patch: Partial<ThreadPreferences>) => void save({ ...preferences, threads: { ...threads, ...patch } });
	return <SettingsPageLayout title="Maintenance">
		<SettingsSection title="Updates and restarts" label="Updates and restarts">
			<SettingsRow title="Provider update checks" description="Check whether newer versions of installed agent CLIs (Claude Code and Codex) are published, and show them under Agents. Turning this off stops these requests; updating stays in your hands either way."
				control={<Switch aria-label="Provider update checks" disabled={disabled} checked={threads.providerUpdateChecks} onCheckedChange={value => set({ providerUpdateChecks: value })} />} />
			<SettingsRow title="Continue chats after restarts" description="Chats that were running when Phaseo quit or crashed continue on their own the next time it starts. When this is off, Phaseo offers to continue them."
				control={<Switch aria-label="Continue chats after restarts" disabled={disabled} checked={threads.continueAfterRestart} onCheckedChange={value => set({ continueAfterRestart: value })} />} />
			{(loading || error) && <SettingsNote tone={error ? "error" : "muted"} role={error ? "alert" : "status"}>{error || "Loading settings…"}</SettingsNote>}
		</SettingsSection>
		<StorageUse />
		<StorageRetention preferences={preferences} set={set} disabled={disabled} />
		<SettingsSection title="Worktrees" label="Worktree cleanup">
			<SettingsRow title="Worktree cleanup" description="Rules for removing worktrees chats no longer need, and their own Clean up now."
				control={<SettingsButton onClick={() => openSettings("worktrees")}>Open Worktrees</SettingsButton>} />
		</SettingsSection>
	</SettingsPageLayout>;
}

/** How long recordings and rotated logs are kept, and Clean up now, which lists what it would remove and asks first. */
function StorageRetention({ preferences, set, disabled }: { preferences: WorkspacePreferences; set: (patch: Partial<ThreadPreferences>) => void; disabled: boolean }) {
	const api = window.phaseoDesktop?.maintenance;
	const threads = preferences.threads;
	const [preview, setPreview] = useState<RetentionPreview>();
	const [last, setLast] = useState<RetentionReport>();
	const [working, setWorking] = useState(false), [error, setError] = useState("");
	useEffect(() => { void api?.retentionLast().then(setLast, () => undefined); }, [api]);
	const check = async () => {
		if (!api || working) return;
		setWorking(true); setError("");
		try { setPreview(await api.retentionPreview()); } catch (reason) { setError(errorText(reason)); } finally { setWorking(false); }
	};
	const clean = async () => {
		if (!api || !preview || working) return;
		setWorking(true); setError("");
		try { setLast(await api.retentionClean(preview.id)); setPreview(undefined); } catch (reason) { setError(errorText(reason)); setPreview(undefined); } finally { setWorking(false); }
	};
	const total = preview ? preview.kinds.recordings.files + preview.kinds.logs.files : 0;
	const describe = (kind: RetentionKind) => { const { files, bytes, afterDays } = preview!.kinds[kind]; return afterDays === null ? "Kept forever" : files ? `${plural(files, "file")}, ${formatBytes(bytes)}, older than ${plural(afterDays, "day")}` : `None older than ${plural(afterDays, "day")}`; };
	return <SettingsSection title="Storage" description="Phaseo keeps everything until you choose otherwise. Files past these days are removed every six hours and by Clean up now; nothing else in Phaseo's data is touched." label="Storage">
		<SettingsRow title="Keep browser recordings" description="Screen recordings of browser tabs, saved by you or an agent. Chats that link a removed recording can no longer open it."
			control={<Select label="Keep browser recordings" disabled={disabled} value={String(threads.recordingsAfterDays ?? "forever")} onValueChange={value => set({ recordingsAfterDays: value === "forever" ? null : Number(value) })} options={keepOptions(threads.recordingsAfterDays)} />} />
		<SettingsRow title="Keep logs" description="Older trace log files, which the app starts afresh at 10 MB. The current log is always kept, for Diagnostics."
			control={<Select label="Keep logs" disabled={disabled} value={String(threads.logsAfterDays ?? "forever")} onValueChange={value => set({ logsAfterDays: value === "forever" ? null : Number(value) })} options={keepOptions(threads.logsAfterDays)} />} />
		<SettingsRow title="Clean up now" description={last ? `Last cleanup ${formatDateTime(last.finishedAt)}: ${retentionSummary(last.removed) ? `removed ${retentionSummary(last.removed)}` : "nothing to remove"}${last.failed ? `; ${plural(last.failed, "file")} could not be removed` : ""}.` : "Lists what these settings would remove, and asks before removing anything."}
			control={<SettingsButton disabled={!api || working} onClick={() => void check()}>{working && !preview ? "Checking…" : "Clean up now"}</SettingsButton>} />
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
		<Dialog open={preview !== undefined} onOpenChange={open => { if (!open && !working) setPreview(undefined); }}>
			<DialogContent className="max-w-md gap-4 p-5">
				<DialogHeader>
					<DialogTitle>{total ? `Remove ${plural(total, "file")}?` : "Nothing to remove"}</DialogTitle>
					<DialogDescription className="text-xs">{total ? "These files are deleted from Phaseo's data folder and cannot be restored." : threads.recordingsAfterDays === null && threads.logsAfterDays === null ? "Both are kept forever. Choose how long to keep them first." : "No file is older than the days you set."}</DialogDescription>
				</DialogHeader>
				{total > 0 && <ul className="flex flex-col gap-1.5 text-xs">{(Object.keys(kindNames) as RetentionKind[]).map(kind => <li key={kind} className="flex gap-2">
					<span className="font-medium">{kindNames[kind][1]}</span>
					<span className="text-muted-foreground">{describe(kind)}</span>
				</li>)}</ul>}
				<DialogFooter>
					<Button size="sm" variant="outline" disabled={working} onClick={() => setPreview(undefined)}>{total ? "Cancel" : "Close"}</Button>
					{total > 0 && <Button size="sm" variant="destructive" disabled={working} onClick={() => void clean()}>{working ? "Removing…" : `Remove ${plural(total, "file")}`}</Button>}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</SettingsSection>;
}

/** What Phaseo's own folder takes on disk, by area, and Clear caches for the ones the window rebuilds by itself. */
function StorageUse() {
	const api = window.phaseoDesktop?.maintenance;
	const [usage, setUsage] = useState<StorageUsage>();
	const [error, setError] = useState("");
	const [clearing, setClearing] = useState(false);
	useEffect(() => { if (!api) return; let active = true; void api.storageUsage().then(value => { if (active) setUsage(value); }, reason => { if (active) setError(errorText(reason)); }); return () => { active = false; }; }, [api]);
	const clear = async () => { if (!api) return; setClearing(true); setError(""); try { setUsage(await api.clearCaches()); } catch (reason) { setError(errorText(reason)); } finally { setClearing(false); } };
	const caches = usage?.areas.find(area => area.id === "caches");
	return <SettingsSection title="Storage" label="Storage use" description={usage ? `${formatBytes(usage.total)} in ${usage.folder}. Worktrees and your projects are stored elsewhere.` : "Adding up Phaseo's folder…"}
		action={<SettingsButton disabled={!api || clearing || !caches} onClick={() => void clear()}>{clearing ? "Clearing…" : "Clear caches"}</SettingsButton>}>
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
		{usage && <ul className="flex flex-col px-4 py-2">{usage.areas.map(area => <li key={area.id} data-storage-area={area.id} className="flex h-8 items-center gap-3 text-[13px]">
			<span className="min-w-0 flex-1 truncate">{area.label}</span>
			<span aria-hidden className="h-1 w-32 shrink-0 overflow-hidden rounded-sm bg-muted"><span className="block h-full bg-primary/70" style={{ width: `${Math.max(2, area.bytes / (usage.total || 1) * 100)}%` }} /></span>
			<span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatBytes(area.bytes)}</span>
		</li>)}</ul>}
	</SettingsSection>;
}
