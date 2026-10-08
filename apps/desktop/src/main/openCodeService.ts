import { execFile, spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Service } from "@opencode/client/service";
import type { Endpoint } from "@opencode/client/service";
import { resolveNativeCommand } from "./nativeProcess";
import { OpenCodeMcp } from "./openCodeMcp";
import { OpenCode } from "@opencode/client";
import type { McpConnection } from "../shared/mcp";

const execute = promisify(execFile);
const compatible = (version: string) => version.startsWith("2.");
export async function resolveOpenCodeCommand(cwd: string, signal?: AbortSignal) {
	for (const name of ["opencode2", "opencode"]) {
		try {
			const command = await resolveNativeCommand(name, [`@opencode/cli/bin/${name}.cjs`, "opencode-ai/bin/opencode"]);
			const { stdout } = await execute(command.executable, [...command.prefix, "--version"], { cwd, windowsHide: true, timeout: 10000, maxBuffer: 8192, signal, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
			const version = stdout.match(/\b(?:v)?(2\.\d+\.\d+(?:[-+][\w.-]+)?)/)?.[1];
			if (version) return { ...command, version };
		} catch { if (signal?.aborted) throw new Error("OpenCode startup cancelled."); }
	}
	throw new Error("Install OpenCode 2 to use this harness. OpenCode 1 is not compatible.");
}

export class OpenCodeService {
	readonly mcp = new OpenCodeMcp();
	private readonly controller = new AbortController();
	private readonly state: string;
	private readonly file: string;
	private starting?: Promise<Endpoint>;
	private managed = false;
	private child?: ChildProcessWithoutNullStreams;
	private childClosed = true;
	private closing?: Promise<void>;
	constructor(private readonly directory: string, private readonly resolveCommand = resolveOpenCodeCommand) {
		this.state = path.join(directory, "native", "opencode", "state"); this.file = path.join(this.state, "opencode", "service.json");
	}
	async connect(signal?: AbortSignal): Promise<Endpoint> {
		if (this.controller.signal.aborted || signal?.aborted) throw new Error("OpenCode startup cancelled.");
		const starting = this.starting ??= this.start().finally(() => { this.starting = undefined; });
		if (!signal) return starting;
		let abort!: () => void;
		try { return await Promise.race([starting, new Promise<never>((_resolve, reject) => { abort = () => reject(new Error("OpenCode startup cancelled.")); signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); })]); }
		finally { signal.removeEventListener("abort", abort); }
	}
	private async start(): Promise<Endpoint> {
		const external = await Service.discover({ version: compatible });
		if (external) return external;
		await mkdir(path.dirname(this.file), { recursive: true });
		const existing = await Service.discover({ file: this.file, version: compatible });
		if (existing) { this.managed = true; return existing; }
		const command = await this.resolveCommand(this.directory, this.controller.signal);
		if (this.controller.signal.aborted) throw new Error("OpenCode startup cancelled.");
		const child = this.child = spawn(command.executable, [...command.prefix, "serve", "--service"], { cwd: this.directory, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", XDG_STATE_HOME: this.state } });
		this.childClosed = false; child.once("close", () => { if (this.child === child) this.childClosed = true; });
		child.stdout.resume(); child.stderr.resume(); child.stdin.end();
		let failure: Error | undefined; child.on("error", error => { failure = error; });
		const deadline = Date.now() + 30000;
		try {
			while (!this.controller.signal.aborted && Date.now() < deadline) {
				if (failure) throw new Error("OpenCode service could not start.", { cause: failure });
				if (child.exitCode !== null && child.exitCode !== 0) throw new Error(`OpenCode service exited with code ${child.exitCode}. Check its native configuration.`);
				const endpoint = await Service.discover({ file: this.file, version: compatible });
				if (endpoint) { this.managed = true; return endpoint; }
				await delay(200, undefined, { signal: this.controller.signal });
			}
			throw new Error(this.controller.signal.aborted ? "OpenCode startup cancelled." : "OpenCode service startup timed out.");
		} catch (error) { child.kill(); await Service.stop({ file: this.file }).catch(() => {}); throw error; }
	}
	close() { return this.closing ??= this.shutdown(); }
	async releaseMcp(cwd: string, projectId: string, connections: McpConnection[]) {
		if (!connections.length) return;
		const endpoints = await Promise.all([Service.discover({ version: compatible }), Service.discover({ file: this.file, version: compatible })]); const seen = new Set<string>();
		for (const endpoint of endpoints) {
			if (!endpoint || seen.has(endpoint.url)) continue; seen.add(endpoint.url);
			try { await this.mcp.synchronize(OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) }), endpoint.url, cwd, projectId, connections.map(value => ({ ...value, enabled: false })), AbortSignal.timeout(30000)); }
			catch { throw new Error("Managed OpenCode MCP connections could not stop. Stop their native workspace tools before retrying removal."); }
		}
	}
	private async shutdown() {
		this.controller.abort();
		await this.starting?.catch(() => {});
		if (this.managed) await Service.stop({ file: this.file }).catch(() => {});
		const child = this.child;
		if (child && !this.childClosed) await new Promise<void>(resolve => {
			const finish = () => { clearTimeout(timeout); child.off("close", finish); resolve(); };
			const timeout = setTimeout(finish, 5000); child.once("close", finish); child.kill();
		});
	}
}
