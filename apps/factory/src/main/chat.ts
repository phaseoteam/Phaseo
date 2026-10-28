import type { AgentProfile, FactorySettings, LogLine } from "../shared/types";
import { launchAgent, type AgentProcess } from "./runner";

/**
 * One turn of a chat: the agent reads the worktree and answers, without changing anything. Claude
 * carries on its session with `resume`; so does Codex with `exec resume`. Messages sent while Claude is
 * still answering go straight to it; Codex takes them after the turn.
 */
export type ChatTurn = AgentProcess;

export function startChatTurn(input: {
	agent: AgentProfile;
	settings: FactorySettings;
	cwd: string;
	prompt: string;
	resume?: string;
	handlers: {
		line(line: LogLine): void;
		session(sessionId: string): void;
		finish(result: { ok: boolean; error?: string; usage?: { inputTokens: number; outputTokens: number } }): void;
	};
}): ChatTurn {
	const { agent, settings, cwd, prompt, resume, handlers } = input;
	let lastError: string | undefined;
	let usage: { inputTokens: number; outputTokens: number } | undefined;
	let finished = false;
	const finish: typeof handlers.finish = (result) => {
		if (finished) return;
		finished = true;
		handlers.finish(result);
	};
	return launchAgent({
		agent, stage: "chat", cwd, settings, prompt, resume,
		handlers: {
			parsed(parsed) {
				for (const line of parsed.lines) handlers.line(line);
				if (parsed.sessionId) handlers.session(parsed.sessionId);
				if (parsed.usage) usage = { inputTokens: (usage?.inputTokens ?? 0) + parsed.usage.inputTokens, outputTokens: (usage?.outputTokens ?? 0) + parsed.usage.outputTokens };
			},
			stderr(text) {
				if (text.trim()) lastError = text.trim().split(/\r?\n/).at(-1);
			},
			exit(code, signal, error) {
				if (signal) return finish({ ok: false, error: "Stopped", usage });
				lastError ??= error;
				finish(code === 0 ? { ok: true, usage } : { ok: false, error: `${agent.label} ${code === null ? "didn't start" : `stopped with exit code ${code}`}${lastError ? `: ${lastError.slice(0, 200)}` : ""}`, usage });
			},
		},
	});
}
