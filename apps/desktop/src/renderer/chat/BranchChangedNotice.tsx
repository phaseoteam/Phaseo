import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { showToast } from "../components/ui/toast";
import { announceProjectChange, onProjectChange } from "../panels/events";

/**
 * In a worktree chat whose checkout is no longer on the branch it was made with (an agent or a terminal switched it):
 * "Branch changed from X" with Restore branch. Read when the chat opens, after each turn and when the project changes.
 */
export function BranchChangedNotice({ task }: { task: Task }) {
	const { api, overview } = useWorkspace();
	const project = overview.projects.find(value => value.id === task.projectId);
	const expected = project?.worktree && !project.worktree.removedAt ? project.worktree.branch : undefined;
	const [current, setCurrent] = useState<string>();
	const [refresh, setRefresh] = useState(0);
	const [busy, setBusy] = useState(false);
	const turnEnded = overview.tasks.find(value => value.id === task.id)?.lastCompletedAt;
	useEffect(() => project ? onProjectChange(project.id, () => setRefresh(value => value + 1)) : undefined, [project]);
	useEffect(() => {
		if (!api || !project || !expected) return;
		let active = true;
		void api.gitRefs(project.id).then(refs => { if (active) setCurrent(refs.current || "detached HEAD"); }, () => undefined);
		return () => { active = false; };
	}, [api, project, expected, refresh, turnEnded, task.status]);
	// While setup renames the temporary branch the two briefly differ, so the notice waits for setup to finish.
	if (!project || !expected || !current || current === expected || task.status === "running" || (task.worktreeSetup && !task.worktreeSetup.finishedAt)) return null;
	const restore = async () => {
		setBusy(true);
		try { await api!.gitCommand(project.id, { type: "switch-branch", name: expected }); setCurrent(expected); announceProjectChange(project.id); }
		catch (reason) { showToast("error", `Could not switch back to ${expected}`, errorText(reason)); }
		finally { setBusy(false); }
	};
	return <section aria-label="Branch changed" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
		<GitBranch className="size-4 shrink-0 text-warning" />
		<span className="text-foreground/85">Branch changed from <span className="font-mono text-xs">{expected}</span> to <span className="font-mono text-xs">{current}</span>.</span>
		<span aria-hidden>·</span>
		<button type="button" disabled={busy} onClick={() => void restore()} className="font-medium text-foreground hover:underline disabled:text-muted-foreground disabled:no-underline">Restore branch</button>
	</section>;
}
