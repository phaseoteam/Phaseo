import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import path from "node:path";
import type { CreateTerminalRequest, TerminalExitStatus, TerminalOutputResponse } from "@agentclientprotocol/sdk";
import type { AgentCallbacks } from "./agentAdapter";
import { resolveProjectPath } from "./projectFiles";

type Terminal = { child: ChildProcess; output: string; truncated: boolean; exitStatus?: TerminalExitStatus; exit: Promise<TerminalExitStatus>; finish: (status: TerminalExitStatus) => void };
export class AcpTerminals {
	private terminals = new Map<string, Terminal>();
	private closing = false;
	private shutdown?: Promise<void>;
	constructor(private readonly root: string, private readonly callbacks: AgentCallbacks) {}
	async create(params: CreateTerminalRequest) {
		if (this.closing) throw new Error("Task stopped.");
		if (this.terminals.size >= 10) throw new Error("Release an existing terminal before starting another.");
		if (!params.command || params.command.includes("\0") || params.command.length > 10000 || params.args?.some(value => value.includes("\0") || value.length > 100000) || (params.args?.length ?? 0) > 100) throw new Error("Invalid terminal command.");
		if ((params.env?.length ?? 0) > 100 || params.env?.some(variable => !variable.name || /[=\0]/.test(variable.name) || variable.value.includes("\0") || variable.value.length > 100000)) throw new Error("Invalid terminal environment.");
		const limit = params.outputByteLimit ?? 1024 * 1024;
		if (!Number.isInteger(limit) || limit < 0 || limit > 1024 * 1024) throw new Error("Terminal output limits must be between 0 bytes and 1 MB.");
		if (params.cwd && !path.isAbsolute(params.cwd)) throw new Error("Terminal working directories must be absolute.");
		const cwd = await resolveProjectPath(this.root, params.cwd ? path.relative(this.root, params.cwd) : ".");
		const description = `${JSON.stringify({ command: params.command, args: params.args ?? [], cwd }, null, 2)}${params.env?.length ? `\nEnvironment overrides: ${params.env.map(variable => variable.name).join(", ")}` : ""}`;
		if (await this.callbacks.onApproval("Run agent terminal", description) !== "accept" || this.closing) throw new Error("Terminal execution declined.");
		if (this.terminals.size >= 10) throw new Error("Release an existing terminal before starting another.");
		const id = randomUUID();
		const child = spawn(params.command, params.args ?? [], { cwd, windowsHide: true, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...Object.fromEntries((params.env ?? []).map(variable => [variable.name, variable.value])) } });
		let resolveExit!: (status: TerminalExitStatus) => void;
		const terminal: Terminal = { child, output: "", truncated: false, exit: new Promise(resolve => { resolveExit = resolve; }), finish: status => {
			if (terminal.exitStatus) return;
			terminal.exitStatus = status; resolveExit(status);
			this.callbacks.onActivity?.({ id: `terminal:${id}`, type: "tool", title: params.command, text: terminal.output, status: status.exitCode === 0 ? "completed" : "failed" });
		} };
		this.terminals.set(id, terminal);
		const append = (text: string) => {
			const bytes = Buffer.from(terminal.output + text);
			if (bytes.length > limit) {
				terminal.truncated = true; let start = bytes.length - limit;
				while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
				terminal.output = bytes.subarray(start).toString("utf8");
			} else terminal.output = bytes.toString("utf8");
		};
		const decoders = [new StringDecoder("utf8"), new StringDecoder("utf8")];
		[child.stdout!, child.stderr!].forEach((stream, index) => stream.on("data", (chunk: Buffer) => append(decoders[index].write(chunk))));
		child.once("error", error => { append(error.message); terminal.finish({ exitCode: 1 }); });
		child.once("close", (exitCode, signal) => { append(decoders.map(decoder => decoder.end()).join("")); terminal.finish({ exitCode, signal }); });
		this.callbacks.onActivity?.({ id: `terminal:${id}`, type: "tool", title: params.command, text: description, status: "running" });
		return { terminalId: id };
	}
	private get(id: string) { const terminal = this.terminals.get(id); if (!terminal) throw new Error("Terminal is unavailable in this session."); return terminal; }
	output(id: string): TerminalOutputResponse { const terminal = this.get(id); return { output: terminal.output, truncated: terminal.truncated, exitStatus: terminal.exitStatus }; }
	wait(id: string) { return this.get(id).exit; }
	async kill(id: string) {
		const terminal = this.get(id);
		if (terminal.exitStatus) return {};
		if (terminal.child.pid && process.platform === "win32") execFile("taskkill.exe", ["/PID", String(terminal.child.pid), "/T", "/F"], { windowsHide: true }, error => { if (error) terminal.child.kill(); });
		else if (terminal.child.pid) { try { process.kill(-terminal.child.pid, "SIGKILL"); } catch { terminal.child.kill("SIGKILL"); } }
		else terminal.child.kill();
		let timer: ReturnType<typeof setTimeout> | undefined;
		try { await Promise.race([terminal.exit, new Promise<void>(resolve => { timer = setTimeout(() => { terminal.child.kill(); terminal.finish({ signal: "SIGKILL" }); resolve(); }, 5000); })]); }
		finally { clearTimeout(timer); }
		return {};
	}
	async release(id: string) { await this.kill(id); this.terminals.delete(id); return {}; }
	close() { this.closing = true; return this.shutdown ??= Promise.allSettled([...this.terminals.keys()].map(id => this.release(id))).then(() => {}); }
}
