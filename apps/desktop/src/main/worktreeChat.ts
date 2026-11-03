import type { ProjectScript } from "../shared/projectSettings";
import { branchFromMessage, generatedBranchName, uniqueBranchName, type WorktreeSetup, type WorktreeSetupStageId, type WorktreeSetupStatus } from "../shared/worktreeChat";

/** What a new worktree chat's setup needs from the runtime. */
export type WorktreeSetupHost = {
	/** Local branch names in the worktree's repository. */
	branches: () => Promise<string[]>;
	renameBranch: (from: string, to: string) => Promise<void>;
	/** The title model's branch fragment for the message, or undefined without a title model. */
	nameBranch: (text: string) => Promise<string | undefined>;
	setupScripts: () => ProjectScript[];
	/** Runs a setup action in a terminal of the chat; resolves with its exit code, or undefined if it was stopped. */
	runScript: (script: ProjectScript) => { terminalId: string; exited: Promise<number | undefined> };
	/** Saves a change to the chat's setup and shows it. */
	update: (mutate: (setup: WorktreeSetup) => void) => void;
	/** The chat was stopped or deleted meanwhile. */
	cancelled: () => boolean;
};

export const stage = (setup: WorktreeSetup, id: WorktreeSetupStageId, status: WorktreeSetupStatus, detail?: string) => {
	const entry = setup.stages.find(value => value.id === id);
	if (entry) { entry.status = status; if (detail !== undefined) entry.detail = detail; }
};

/**
 * Worktree setup after checkout: renames the temporary branch from the first message, then runs the project's
 * setup actions one at a time, waiting for each. Resolves true when the agent may start. A failed rename keeps the
 * temporary branch; a failed setup action stops the chat until the person resumes it.
 */
export async function runWorktreeSetup(host: WorktreeSetupHost, temporary: string, text: string) {
	host.update(setup => stage(setup, "branch", "running"));
	try {
		const fragment = text.trim() ? await host.nameBranch(text).catch(() => undefined) : undefined;
		if (!text.trim()) host.update(setup => stage(setup, "branch", "skipped", "No message to name it from"));
		else {
			const branch = uniqueBranchName((await host.branches()).filter(name => name !== temporary), fragment ? generatedBranchName(fragment) : branchFromMessage(text));
			await host.renameBranch(temporary, branch);
			host.update(setup => { setup.branch = branch; stage(setup, "branch", "done", branch); });
		}
	} catch (error) { host.update(setup => stage(setup, "branch", "failed", `Kept ${temporary}: ${error instanceof Error ? error.message : "the rename failed"}`)); }
	const scripts = host.setupScripts();
	if (!scripts.length) host.update(setup => stage(setup, "setup", "skipped", "This project has no setup action"));
	for (const script of scripts) {
		if (host.cancelled()) return false;
		let started: ReturnType<WorktreeSetupHost["runScript"]>;
		try { started = host.runScript(script); }
		catch (error) { host.update(setup => { stage(setup, "setup", "failed", script.name); setup.error = `${script.name} could not start: ${error instanceof Error ? error.message : "no terminal is free"}`; setup.finishedAt = new Date().toISOString(); }); return false; }
		host.update(setup => { stage(setup, "setup", "running", script.name); setup.script = { name: script.name, command: script.command, terminalId: started.terminalId }; });
		const exitCode = await started.exited;
		if (exitCode !== 0) {
			host.update(setup => { setup.script = { ...setup.script!, ...(exitCode === undefined ? {} : { exitCode }) }; stage(setup, "setup", "failed", script.name); setup.error = exitCode === undefined ? `${script.name} was stopped before it finished.` : `${script.name} exited with code ${exitCode}. Fix it in its terminal, then resume the chat.`; setup.finishedAt = new Date().toISOString(); });
			return false;
		}
		host.update(setup => { setup.script = { ...setup.script!, exitCode }; });
	}
	if (scripts.length) host.update(setup => stage(setup, "setup", "done", scripts.map(script => script.name).join(", ")));
	host.update(setup => { setup.finishedAt = new Date().toISOString(); });
	return !host.cancelled();
}
