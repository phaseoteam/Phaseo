import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { Project } from "../shared/workspace";
import type { TaskOverview } from "../shared/workspaceOverview";
import type { WorktreeCleanupRules } from "../shared/preferences";
import type { WorktreeCleanupEntry } from "../shared/worktreeCleanup";
import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { runGh } from "./projectPullRequestView";

const execute = promisify(execFile);
const day = 86_400_000;
const time = (value?: string) => { const parsed = value ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : 0; };
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Whether the branch's pull request merged at exactly this head commit (T3's storageCleanupPullRequestMerged). */
export type MergedCheck = (sourceDirectory: string, branch: string, head: string) => Promise<boolean>;
export const pullRequestMergedAtHead: MergedCheck = async (sourceDirectory, branch, head) => {
	const repo = `github.com/${githubRepository(await git(sourceDirectory, ["remote", "get-url", "origin"]))}`;
	const view = JSON.parse(await runGh(sourceDirectory, ["pr", "view", branch, "--repo", repo, "--json", "state,headRefOid"])) as { state?: unknown; headRefOid?: unknown };
	return view.state === "MERGED" && view.headRefOid === head;
};

/** The default branch the source checkout's origin names, refreshed from the remote when it can be. */
async function defaultBranch(sourceDirectory: string) {
	let name: string | undefined;
	try { name = (await git(sourceDirectory, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim().replace(/^origin\//, "") || undefined; } catch { return undefined; }
	if (!name) return undefined;
	try { await execute("git", ["--no-pager", "fetch", "--quiet", "origin", name], { cwd: sourceDirectory, windowsHide: true, timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }); } catch { /* The last fetched state still answers. */ }
	return name;
}

/**
 * T3's worktree cleanup rules for Phaseo's managed worktrees. A worktree is removed when a rule applies: its chats were
 * all deleted, it has been inactive or every chat settled for long enough, it has no commits beyond the default
 * branch, or its pull request merged at its current commit. It is always kept while a chat runs or has queued
 * messages, a terminal or Git action holds it, its branch changed, it has any uncommitted or untracked file, or it has
 * commits on no remote (unless GitHub merged exactly that commit).
 */
export async function planWorktreeCleanup(input: { projects: readonly Project[]; tasks: readonly TaskOverview[]; rules: WorktreeCleanupRules; now: number; blocked: (project: Project) => string | undefined; merged?: MergedCheck; only?: ReadonlySet<string> }): Promise<WorktreeCleanupEntry[]> {
	const { rules, now } = input, merged = input.merged ?? pullRequestMergedAtHead;
	const defaults = new Map<string, Promise<string | undefined>>();
	const entries: WorktreeCleanupEntry[] = [];
	for (const project of input.projects) {
		if (!project.worktree || project.worktree.removedAt || (input.only && !input.only.has(project.id))) continue;
		const entry = (outcome: "remove" | "keep", reason: string) => entries.push({ projectId: project.id, name: project.name, branch: project.worktree!.branch, outcome, reason });
		const keep = (reason: string) => entry("keep", reason);
		const source = input.projects.find(value => value.id === project.worktree!.sourceProjectId);
		if (!existsSync(project.directory)) { keep("Its folder is missing"); continue; }
		if (!source || source.worktree?.removedAt || !existsSync(source.directory)) { keep("Its project is unavailable"); continue; }
		const chats = input.tasks.filter(task => task.projectId === project.id);
		if (chats.some(task => task.status === "running" || task.status === "waiting" || (task.queueCount ?? 0) > 0)) { keep("A chat is running or has queued messages"); continue; }
		const blocked = input.blocked(project);
		if (blocked) { keep(blocked); continue; }
		try {
			const branch = (await git(project.directory, ["branch", "--show-current"])).trim();
			if (branch !== project.worktree.branch) { keep("Its branch changed"); continue; }
			const changes = (await git(project.directory, ["status", "--porcelain=v1", "--untracked-files=all"])).split(/\r?\n/).filter(Boolean).length;
			if (changes) { keep(`Has uncommitted changes (${plural(changes, "file")})`); continue; }
			const head = (await git(project.directory, ["rev-parse", "HEAD"])).trim();
			const unpushed = Number((await git(project.directory, ["rev-list", "--count", "HEAD", "--not", "--remotes"])).trim()) || 0;
			const activity = Math.max(time(project.createdAt), ...chats.flatMap(task => [time(task.updatedAt), time(task.lastUserMessageAt), time(task.lastCompletedAt)]));
			const settledAt = chats.map(task => task.archived ? time(task.updatedAt) : task.settledOverride === "settled" ? time(task.settledAt) || time(task.updatedAt) : undefined);
			const settledFor = chats.length && settledAt.every(value => value !== undefined) ? now - Math.max(activity, ...settledAt as number[]) : undefined;
			let reason: string | undefined;
			// A worktree made by hand gets a day to gain its chat, as T3 waits for a checkout's thread to appear.
			if (rules.orphaned && !chats.length && now - activity >= day) reason = "No chat uses it any more";
			else if (rules.afterDays !== null && now - activity >= rules.afterDays * day) reason = `Inactive for ${plural(Math.floor((now - activity) / day), "day")}`;
			else if (rules.settledAfterDays !== null && settledFor !== undefined && settledFor >= rules.settledAfterDays * day) reason = `Settled for ${plural(Math.floor(settledFor / day), "day")}`;
			let mergedHere = false;
			if (!reason && (rules.unchanged || rules.onMerge)) {
				if (!defaults.has(source.directory)) defaults.set(source.directory, defaultBranch(source.directory));
				const base = await defaults.get(source.directory);
				if (!base) { keep("Its default branch is unavailable"); continue; }
				let integrated = false;
				try { await git(project.directory, ["merge-base", "--is-ancestor", head, `refs/remotes/origin/${base}`]); integrated = true; } catch { /* Commits beyond the default branch. */ }
				if (integrated && rules.unchanged) reason = `No commits beyond ${base}`;
				else if (rules.onMerge && await merged(source.directory, branch, head).catch(() => false)) { reason = "Its pull request was merged"; mergedHere = true; }
			}
			if (!reason) { keep(rules.afterDays !== null ? `Inactive for ${Math.floor((now - activity) / day)} of ${plural(rules.afterDays, "day")}` : settledFor === undefined && rules.settledAfterDays !== null ? "Not settled" : "No rule applies"); continue; }
			// Never remove work that exists only here; GitHub holding the merged commit counts as pushed.
			if (unpushed && !mergedHere) { keep(`Has ${plural(unpushed, "commit")} not pushed`); continue; }
			entry("remove", reason);
		} catch (error) { keep(`Could not be checked: ${error instanceof Error ? error.message.split("\n")[0] : "Git failed"}`); }
	}
	return entries;
}
