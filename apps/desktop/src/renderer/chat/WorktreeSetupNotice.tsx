import { Check, Circle, FolderGit2, LoaderCircle, Minus, X } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { worktreeSetupStageLabels, type WorktreeSetupStatus } from "../../shared/worktreeChat";
import { runCommand, shortcut } from "../lib/keybindings";
import { cn } from "../lib/utils";

const stageIcon: Record<WorktreeSetupStatus, typeof Check> = { pending: Circle, running: LoaderCircle, done: Check, skipped: Minus, failed: X };

/**
 * Worktree setup progress in the chat: creating the worktree, naming its branch and running the setup action,
 * until the agent starts. A failed setup stays, beside the chat's Resume.
 */
export function WorktreeSetupNotice({ task }: { task: Task }) {
	const setup = task.worktreeSetup;
	// The first message stays queued until setup succeeds (or the person resumes), so a started turn ends the notice.
	if (!setup || (task.conversationCounts?.messages ?? task.messages.length) > 0) return null;
	const done = Boolean(setup.finishedAt) && !setup.error;
	return <section aria-label="Worktree setup" aria-busy={!setup.finishedAt} className="flex flex-col gap-1 text-[13px]">
		<p className="flex items-center gap-2 font-medium text-foreground/85"><FolderGit2 className="size-4 text-muted-foreground" />
			{setup.error ? "Worktree setup stopped" : done ? "Worktree ready" : "Setting up the worktree…"}
			<span className="font-mono text-xs font-normal text-muted-foreground">{setup.branch}</span>
		</p>
		<ol className="ml-[7px] flex flex-col gap-0.5 border-l border-border pl-3.5">
			{setup.stages.map(stage => {
				const Icon = stageIcon[stage.status];
				return <li key={stage.id} className={cn("flex items-center gap-2 text-xs", stage.status === "pending" || stage.status === "skipped" ? "text-muted-foreground" : "text-foreground/85")}>
					<Icon className={cn("size-3.5 shrink-0", stage.status === "running" && "animate-spin text-primary", stage.status === "done" && "text-success", stage.status === "failed" && "text-destructive")} />
					<span>{worktreeSetupStageLabels[stage.id]}</span>
					{stage.detail && <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">{stage.detail}</span>}
				</li>;
			})}
		</ol>
		{setup.script?.terminalId && <p className="ml-6 text-xs text-muted-foreground">
			<button type="button" onClick={() => runCommand("terminal.toggle")} className="font-medium text-foreground hover:underline">Show the setup output</button>{shortcut("terminal.toggle") && ` (${shortcut("terminal.toggle")})`}
		</p>}
	</section>;
}
