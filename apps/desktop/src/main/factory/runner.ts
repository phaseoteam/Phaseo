import type { AgentProfile, LogLine, Run, RunReport, StageId, WorkItem } from "../../shared/factory/types";

/**
 * The seam between Factory's store and whatever runs a stage. In the desktop app that is a child thread of the item's
 * thread (stageThreads.ts); tests pass their own.
 */

export interface RunHandlers {
	log(line: LogLine): void;
	/** The desktop thread the run works in, so a reply can carry on the same conversation. */
	session(threadId: string): void;
	/** `crashed`: the agent ended badly without a report, which is worth carrying on rather than failing. */
	finish(result: { status: Run["status"]; summary?: string; usage?: Run["usage"]; report?: RunReport; crashed?: boolean }): void;
}

/** The item's worktree, and the clone it was made from. */
export interface StageWorkspace {
	dir: string;
	branch: string;
	clone: string;
}

export interface StageStart {
	item: WorkItem;
	runId: string;
	agent: AgentProfile;
	stage: StageId;
	workspace: StageWorkspace;
	/** The run's proof folder, inside the worktree. */
	proof: string;
	prompt: string;
	/** The thread of the run this one carries on, when it should continue that conversation. */
	resume?: string;
	/** Files already changed before the run, so a read-only stage isn't blamed for them. */
	changedBefore: string[];
	handlers: RunHandlers;
}

export interface AgentProcess {
	/** Hands a message to the running agent: steered into its turn where the harness can, queued after it otherwise. */
	send(text: string): boolean;
	/** Ends it. Its end still comes through `finish`, as cancelled. */
	stop(): void;
}

export interface StageRunner {
	start(input: StageStart): Promise<AgentProcess>;
}
