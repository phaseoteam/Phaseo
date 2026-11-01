import { formatDateTime } from "@phaseo/app-kit/format";
import { useState } from "react";
import type { WorkspacePreferences, WorktreeCleanupRules } from "../../shared/preferences";
import type { WorktreeCleanupEntry, WorktreeCleanupReport, WorktreeSize } from "../../shared/worktreeCleanup";
import { formatBytes } from "./diagnosticsFormat";
import { errorText, useWorkspace } from "../app/workspace";
import { Select } from "../components/Select";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { showToast } from "../components/ui/toast";
import { SettingsButton, SettingsNote, SettingsRow, SettingsSection } from "./SettingsLayout";

const dayOptions = (values: number[], current: number | null, zero?: string) => [{ value: "never", label: "Never" }, ...[...new Set([...values, ...current === null ? [] : [current]])].sort((a, b) => a - b).map(days => ({ value: String(days), label: days === 0 ? zero ?? "Right away" : days === 1 ? "After 1 day" : `After ${days} days` }))];
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What a finished run did, in one line. */
export function cleanupSummary(report: WorktreeCleanupReport) {
	const removed = report.entries.filter(entry => entry.outcome === "removed").length, kept = report.entries.filter(entry => entry.outcome !== "removed").length;
	return removed ? `Removed ${plural(removed, "worktree")}${kept ? `, kept ${kept}` : ""}.` : kept ? `Nothing removed; kept ${plural(kept, "worktree")}.` : "No worktrees to check.";
}

/**
 * Worktree cleanup in Settings → General: the rules, whether they run on their own (off by default), and Clean up
 * now, which lists what it will remove and asks first.
 */
export function WorktreeCleanupSettings({ preferences, save, disabled }: { preferences: WorkspacePreferences; save: (value: WorkspacePreferences) => Promise<void>; disabled: boolean }) {
	const { api, setOverview } = useWorkspace();
	const rules = preferences.worktreeCleanup;
	const set = (patch: Partial<WorktreeCleanupRules>) => void save({ ...preferences, worktreeCleanup: { ...rules, ...patch } });
	const [plan, setPlan] = useState<WorktreeCleanupEntry[]>();
	const [sizes, setSizes] = useState<Record<string, WorktreeSize>>();
	const [last, setLast] = useState<WorktreeCleanupReport>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const check = async () => {
		if (!api || busy) return;
		setBusy(true); setError("");
		try {
			const result = await api.worktreeCleanup({ type: "plan" }); setPlan(result.report.entries); setLast(result.last); setSizes(undefined);
			// Sizes arrive after the list, since measuring a big checkout takes a while; removing does not wait for them.
			const ids = result.report.entries.filter(entry => entry.outcome === "remove").map(entry => entry.projectId);
			if (ids.length) void api.worktreeSizes(ids).then(setSizes, () => setSizes({}));
		}
		catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	};
	const remove = async (entries: WorktreeCleanupEntry[]) => {
		if (!api || busy) return;
		setBusy(true); setError("");
		try {
			const result = await api.worktreeCleanup({ type: "remove", projectIds: entries.map(entry => entry.projectId) });
			setOverview(result.workspace); setPlan(undefined); setLast(result.report);
			showToast("success", cleanupSummary(result.report));
		} catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	};
	const removing = plan?.filter(entry => entry.outcome === "remove") ?? [], kept = plan?.filter(entry => entry.outcome === "keep") ?? [];
	return <SettingsSection title="Worktrees" description="Remove the worktrees chats no longer need. A worktree with uncommitted changes, untracked files or commits that are not pushed is always kept, as is one a chat or terminal is using." label="Worktrees">
		<SettingsRow title="Clean up automatically" description="Check every six hours and remove the worktrees these rules pick. Branches and chats are kept."
			control={<Switch aria-label="Clean up worktrees automatically" disabled={disabled} checked={rules.enabled} onCheckedChange={value => set({ enabled: value })} />} />
		<SettingsRow title="When its pull request merges" description="GitHub merged the branch at the worktree's current commit."
			control={<Switch aria-label="Remove worktrees when their pull request merges" disabled={disabled} checked={rules.onMerge} onCheckedChange={value => set({ onMerge: value })} />} />
		<SettingsRow title="When it has nothing new" description="It has no commits beyond the default branch."
			control={<Switch aria-label="Remove unchanged worktrees" disabled={disabled} checked={rules.unchanged} onCheckedChange={value => set({ unchanged: value })} />} />
		<SettingsRow title="When no chat uses it" description="Its chats were deleted, a day or more ago."
			control={<Switch aria-label="Remove worktrees no chat uses" disabled={disabled} checked={rules.orphaned} onCheckedChange={value => set({ orphaned: value })} />} />
		<SettingsRow title="After its chats settle" description="Every chat in it has been settled or archived for this long."
			control={<Select label="Remove worktrees after their chats settle" disabled={disabled} value={String(rules.settledAfterDays ?? "never")} onValueChange={value => set({ settledAfterDays: value === "never" ? null : Number(value) })} options={dayOptions([0, 1, 3, 7, 14, 30], rules.settledAfterDays)} />} />
		<SettingsRow title="After inactivity" description="Nothing has happened in its chats for this long."
			control={<Select label="Remove inactive worktrees" disabled={disabled} value={String(rules.afterDays ?? "never")} onValueChange={value => set({ afterDays: value === "never" ? null : Number(value) })} options={dayOptions([7, 14, 30, 60, 90], rules.afterDays)} />} />
		<SettingsRow title="Clean up now" description={last ? `Last run ${formatDateTime(last.checkedAt)}${last.automatic ? " (automatic)" : ""}: ${cleanupSummary(last)}` : "Lists what these rules would remove, and asks before removing anything."}
			control={<SettingsButton disabled={!api || busy} onClick={() => void check()}>{busy && !plan ? "Checking…" : "Clean up now"}</SettingsButton>} />
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
		<Dialog open={plan !== undefined} onOpenChange={open => { if (!open && !busy) setPlan(undefined); }}>
			<DialogContent className="max-w-lg gap-4 p-5">
				<DialogHeader>
					<DialogTitle>{removing.length ? `Remove ${plural(removing.length, "worktree")}?` : "Nothing to remove"}</DialogTitle>
					<DialogDescription className="text-xs">{removing.length ? `Each checkout and its ignored files are deleted${freed(removing, sizes)}. Branches and chats are kept, and each worktree is checked again before it goes.` : "No worktree matches the rules right now."}</DialogDescription>
				</DialogHeader>
				<ScrollArea className="max-h-80" viewportClassName="max-h-80">
					{removing.length > 0 && <EntryList title="Will be removed" entries={removing} sizes={sizes ?? "measuring"} />}
					{kept.length > 0 && <EntryList title="Kept" entries={kept} muted />}
				</ScrollArea>
				<DialogFooter>
					<Button size="sm" variant="outline" disabled={busy} onClick={() => setPlan(undefined)}>{removing.length ? "Cancel" : "Close"}</Button>
					{removing.length > 0 && <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove(removing)}>{busy ? "Removing…" : `Remove ${plural(removing.length, "worktree")}`}</Button>}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</SettingsSection>;
}

/** ", freeing about 4.2 GB" once every worktree to remove has been measured. */
function freed(entries: WorktreeCleanupEntry[], sizes?: Record<string, WorktreeSize>) {
	const measured = entries.map(entry => sizes?.[entry.projectId]);
	if (!measured.length || measured.some(size => !size)) return "";
	const total = measured.reduce((sum, size) => sum + size!.bytes, 0);
	return `, freeing ${measured.some(size => size!.partial) ? "at least" : "about"} ${formatBytes(total)}`;
}

/** "1.20 GB · dependencies 900 MB · build 120 MB", or "at least …" when the count stopped early. */
export function sizeLabel(size: WorktreeSize) {
	return [`${size.partial ? "at least " : ""}${formatBytes(size.bytes)}`, ...size.dependencies ? [`dependencies ${formatBytes(size.dependencies)}`] : [], ...size.build ? [`build ${formatBytes(size.build)}`] : []].join(" · ");
}

function EntryList({ title, entries, muted, sizes }: { title: string; entries: WorktreeCleanupEntry[]; muted?: boolean; sizes?: Record<string, WorktreeSize> | "measuring" }) {
	return <div className="mb-3">
		<p className="mb-1 text-xs font-semibold text-foreground/80">{title}</p>
		<ul className="flex flex-col gap-1">{entries.map(entry => <li key={entry.projectId} className="flex min-w-0 flex-col text-xs">
			<span className={muted ? "truncate text-muted-foreground" : "truncate"}>{entry.name}</span>
			<span className="truncate text-muted-foreground"><span className="font-mono">{entry.branch}</span> · {entry.reason}</span>
			{sizes && <span className="truncate text-muted-foreground">{sizes === "measuring" ? "Measuring size…" : sizes[entry.projectId] ? sizeLabel(sizes[entry.projectId]) : "Size unknown"}</span>}
		</li>)}</ul>
	</div>;
}
