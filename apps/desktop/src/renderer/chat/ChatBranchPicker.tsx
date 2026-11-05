import { useEffect, useState } from "react";
import type { Task } from "../../shared/workspace";
import type { GitRefs } from "../../shared/gitDiff";
import { errorText, useWorkspace } from "../app/workspace";
import { showToast } from "../components/ui/toast";
import { announceProjectChange, onProjectChange } from "../panels/events";
import { BranchPicker } from "./WorktreeTarget";

/**
 * The branch the chat's checkout is on, switched from the composer. Read when the chat opens, after each turn and
 * when the project changes; hidden outside a Git checkout. Switching waits while the agent works in the checkout.
 */
export function ChatBranchPicker({ task }: { task: Task }) {
	const { api, overview } = useWorkspace();
	const project = overview.projects.find(value => value.id === task.projectId);
	const projectId = project && !project.worktree?.removedAt ? project.id : undefined;
	const [refs, setRefs] = useState<GitRefs>();
	const [refresh, setRefresh] = useState(0);
	const [busy, setBusy] = useState(false);
	const turnEnded = overview.tasks.find(value => value.id === task.id)?.lastCompletedAt;
	useEffect(() => projectId ? onProjectChange(projectId, () => setRefresh(value => value + 1)) : undefined, [projectId]);
	useEffect(() => {
		if (!api || !projectId) return;
		let active = true;
		void api.gitRefs(projectId).then(value => { if (active) setRefs(value); }, () => { if (active) setRefs(undefined); });
		return () => { active = false; };
	}, [api, projectId, refresh, turnEnded]);
	if (!api || !projectId || !refs || (!refs.current && !refs.local.length)) return null;
	const running = task.status === "running" || task.status === "waiting";
	const choose = async (name: string) => {
		if (name === refs.current) return;
		setBusy(true);
		try { await api.gitCommand(projectId, { type: "switch-branch", name }); setRefs({ ...refs, current: name }); announceProjectChange(projectId); }
		catch (reason) { showToast("error", `Could not switch to ${name}`, errorText(reason)); }
		finally { setBusy(false); }
	};
	return <BranchPicker refs={refs} value={refs.current} onChange={name => void choose(name)} disabled={busy || running || task.archived} localOnly
		label={refs.current || "Detached HEAD"} ariaLabel="Branch" title={running ? "Switch branches once the agent stops" : "Switch the branch this chat's checkout is on"} />;
}
