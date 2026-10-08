import type { Account, Task } from "../shared/workspace";
import type { McpConnection } from "../shared/mcp";
import type { AttachmentContent } from "./attachments";
import { AgentInputRejectedError, type AgentAdapter, type AgentCallbacks } from "./agentAdapter";
import { AcpAdapter } from "./acpAdapter";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";
import { grokLaunchArgs, resolveGrokCommand } from "./grokLaunch";

export class GrokAdapter implements AgentAdapter {
	private adapter?: AcpAdapter;
	private cancelled = false;
	constructor(private readonly mcp: McpConnection[] = []) {}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments: AttachmentContent[] = []) {
		try {
			if (account && (account.harness !== "grok" || account.kind !== "native" || !account.configDirectory)) throw new AgentInputRejectedError("Choose a native Grok profile.");
			const args = grokLaunchArgs(task.mode);
			const command = await resolveGrokCommand();
			if (this.cancelled) throw new AgentInputRejectedError("Task stopped.");
			this.adapter = new AcpAdapter({ id: "grok", name: "Grok", executable: command.executable, arguments: [...command.prefix, ...args] }, this.mcp, nativeAccountEnvironment(account));
		} catch (error) { if (error instanceof AgentInputRejectedError) throw error; throw new AgentInputRejectedError("Install the native Grok CLI to use this harness.", { cause: error }); }
		await this.adapter.run(task, cwd, text, callbacks, account, attachments);
	}
	async cancel() { this.cancelled = true; await this.adapter?.cancel(); }
}
