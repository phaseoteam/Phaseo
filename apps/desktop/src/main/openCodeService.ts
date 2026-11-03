import { execFile, spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Service } from "@opencode/client/service";
import type { Endpoint } from "@opencode/client/service";
import { resolveNativeCommand } from "./nativeProcess";
import { OpenCodeMcp } from "./openCodeMcp";
import { span } from "./diagnostics/tracer";
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
	private readonly isolatedServices = new Set<() => Promise<void>>();
	constructor(private readonly directory: string, private readonly resolveCommand = resolveOpenCodeCommand) {
		this.state = path.join(directory, "native", "opencode", "state"); this.file = path.join(this.state, "opencode", "service.json");
	}
	async connect(signal?: AbortSignal): Promise<Endpoint> {
		if (this.controller.signal.aborted || signal?.aborted) throw new Error("OpenCode startup cancelled.");
		const starting = this.starting ??= span("opencode.start", undefined, () => this.start()).finally(() => { this.starting = undefined; });
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
		const endpoint = await this.spawnService(this.state, this.file, this.controller.signal, child => { this.child = child; this.childClosed = false; child.once("close", () => { if (this.child === child) this.childClosed = true; }); });
		this.managed = true; return endpoint;
	}
	/**
	 * A service of its own for one turn, never the shared or an external one: MCP servers added to it at runtime (the turn's
	 * orchestration credential) exist only in this process, so no other session can reach them. Sessions are kept in OpenCode's
	 * shared data folder, so a chat resumes on any service.
	 */
	async isolated(signal: AbortSignal): Promise<{ endpoint: Endpoint; close: () => Promise<void> }> {
		if (this.controller.signal.aborted || signal.aborted) throw new Error("OpenCode startup cancelled.");
		const state = path.join(this.directory, "native", "opencode", "turns", randomUUID()), file = path.join(state, "opencode", "service.json");
		let child: ChildProcessWithoutNullStreams | undefined;
		const close = async () => {
			this.isolatedServices.delete(close);
			await Service.stop({ file }).catch(() => {});
			const running = child;
			if (running && running.exitCode === null) await new Promise<void>(resolve => { const timeout = setTimeout(resolve, 5000); running.once("close", () => { clearTimeout(timeout); resolve(); }); running.kill(); });
			await rm(state, { recursive: true, force: true }).catch(() => {});
		};
		this.isolatedServices.add(close);
		try {
			await mkdir(path.dirname(file), { recursive: true });
			// A service otherwise listens on its fixed default port, which the shared one may hold.
			return { endpoint: await span("opencode.start-isolated", undefined, () => this.spawnService(state, file, AbortSignal.any([this.controller.signal, signal]), value => { child = value; }, ["--hostname", "127.0.0.1", "--port", "0"])), close };
		} catch (error) { await close(); throw error; }
	}
	private async spawnService(state: string, file: string, signal: AbortSignal, onSpawn: (child: ChildProcessWithoutNullStreams) => void, flags: string[] = []): Promise<Endpoint> {
		const command = await this.resolveCommand(this.directory, signal);
		if (signal.aborted) throw new Error("OpenCode startup cancelled.");
		const child = spawn(command.executable, [...command.prefix, "serve", "--service", ...flags], { cwd: this.directory, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", XDG_STATE_HOME: state } });
		onSpawn(child);
		child.stdout.resume(); child.stderr.resume(); child.stdin.end();
		let failure: Error | undefined; child.on("error", error => { failure = error; });
		const deadline = Date.now() + 30000;
		try {
			while (!signal.aborted && Date.now() < deadline) {
				if (failure) throw new Error("OpenCode service could not start.", { cause: failure });
				if (child.exitCode !== null && child.exitCode !== 0) throw new Error(`OpenCode service exited with code ${child.exitCode}. Check its native configuration.`);
				const endpoint = await Service.discover({ file, version: compatible });
				if (endpoint) return endpoint;
				await delay(200, undefined, { signal });
			}
			throw new Error(signal.aborted ? "OpenCode startup cancelled." : "OpenCode service startup timed out.");
		} catch (error) { child.kill(); await Service.stop({ file }).catch(() => {}); throw error; }
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
		await Promise.all([...this.isolatedServices].map(close => close()));
		await this.starting?.catch(() => {});
		if (this.managed) await Service.stop({ file: this.file }).catch(() => {});
		const child = this.child;
		if (child && !this.childClosed) await new Promise<void>(resolve => {
			const finish = () => { clearTimeout(timeout); child.off("close", finish); resolve(); };
			const timeout = setTimeout(finish, 5000); child.once("close", finish); child.kill();
		});
	}
}
