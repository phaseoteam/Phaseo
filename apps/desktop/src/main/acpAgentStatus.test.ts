import { EventEmitter } from "node:events";
import type * as ChildProcessModule from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { agent, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async importOriginal => ({ ...await importOriginal<typeof ChildProcessModule>(), spawn: native.spawn }));
import { checkAcpAgent } from "./acpAgentStatus";

const config = { id: "agent", name: "Agent", executable: "fixture-executable", arguments: ["--acp"] };
function streams() { const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); return child; }

describe("ACP connection checks", () => {
	it("uses real SDK initialization, reports capabilities and denies host filesystem access", async () => {
		const child = streams(); const startSession = vi.fn();
		const connection = agent({ name: "fixture" }).onRequest("initialize", async ({ params, client }) => {
			expect(params.clientCapabilities).toEqual({ fs: { readTextFile: false, writeTextFile: false }, terminal: false, auth: { terminal: false } }); await expect(client.request("fs/read_text_file", { sessionId: "unopened", path: "/private" })).rejects.toThrow();
			return { protocolVersion: params.protocolVersion, agentInfo: { name: "Fixture", version: "1.2.3" }, agentCapabilities: { loadSession: true, promptCapabilities: { image: true }, sessionCapabilities: { fork: {} } }, authMethods: [{ id: "native", name: "Browser sign-in" }], _meta: { accessToken: "never-expose" } };
		}).onRequest("session/new", startSession).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			const status = await checkAcpAgent(config, "/cwd"); expect(status).toMatchObject({ name: "Fixture", version: "1.2.3", protocolVersion: PROTOCOL_VERSION, capabilities: ["Session loading", "Native forks", "Image input"], authMethods: ["Browser sign-in"] });
			expect(startSession).not.toHaveBeenCalled(); expect(JSON.stringify(status)).not.toContain("never-expose"); expect(child.kill).toHaveBeenCalled();
			expect(native.spawn).toHaveBeenCalledWith(config.executable, config.arguments, expect.objectContaining({ shell: false, windowsHide: true, env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: "1" }) }));
		} finally { connection.close(); }
	});
	it("rejects incompatible protocol versions", async () => {
		const child = streams(); const connection = agent({ name: "fixture" }).onRequest("initialize", () => ({ protocolVersion: PROTOCOL_VERSION + 1, agentCapabilities: {} })).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try { await expect(checkAcpAgent(config, "/cwd")).rejects.toThrow("unsupported ACP protocol"); expect(child.kill).toHaveBeenCalled(); }
		finally { connection.close(); }
	});
	it("cancels an unanswered initialization and kills the process", async () => {
		const child = streams(); const controller = new AbortController(); const checking = checkAcpAgent(config, "/cwd", controller.signal); const rejected = expect(checking).rejects.toThrow("cancelled");
		controller.abort(); await rejected; expect(child.kill).toHaveBeenCalled();
	});
});
