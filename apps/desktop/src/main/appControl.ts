import { randomUUID } from "node:crypto";
import { agentAppCommands, validateAppCommand, type AppCommandArgs, type AppCommandId, type AppCommandRequest, type AppCommandResult } from "../shared/appCommands";

/**
 * Runs app commands for agents and the person. Main commands run here; renderer commands go to the window as a request
 * and resolve when it replies, so the window is just one client of the registry.
 */
export class AppControl {
	private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
	constructor(private readonly options: {
		/** Sends a request to the window; false when there is none. */
		send: (request: AppCommandRequest) => boolean;
		main: (command: AppCommandId, args: AppCommandArgs, caller: "agent" | "person") => Promise<unknown>;
		timeoutMs?: number;
	}) {}
	list(query?: string) { return { commands: agentAppCommands(query) }; }
	async run(caller: "agent" | "person", id: unknown, args: unknown): Promise<unknown> {
		const { command, args: valid } = validateAppCommand(id, args, caller);
		const result = command.surface === "main" ? await this.options.main(command.id as AppCommandId, valid, caller) : await this.renderer(command.id as AppCommandId, valid);
		return { command: command.id, ...result === undefined ? { done: true } : { result } };
	}
	renderer(command: AppCommandId, args: AppCommandArgs): Promise<unknown> {
		const requestId = randomUUID();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("The window did not answer in time.")); }, this.options.timeoutMs ?? 10_000);
			timer.unref?.();
			this.pending.set(requestId, { resolve, reject, timer });
			if (!this.options.send({ requestId, command, args })) { clearTimeout(timer); this.pending.delete(requestId); reject(new Error("The app has no window open.")); }
		});
	}
	/** The window's answer; unknown or late answers are ignored. */
	resolve(value: unknown) {
		const result = value as AppCommandResult | undefined;
		if (!result || typeof result !== "object" || typeof result.requestId !== "string") return;
		const waiting = this.pending.get(result.requestId);
		if (!waiting) return;
		this.pending.delete(result.requestId); clearTimeout(waiting.timer);
		if (result.ok) waiting.resolve(result.result);
		else waiting.reject(new Error(typeof result.error === "string" ? result.error.slice(0, 500) : "The command failed."));
	}
	close() { for (const [id, waiting] of this.pending) { clearTimeout(waiting.timer); waiting.reject(new Error("The app is closing.")); this.pending.delete(id); } }
}
