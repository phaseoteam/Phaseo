import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import { agent, ndJsonStream } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ spawn: vi.fn(), resolve: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: native.spawn }));
vi.mock("./grokLaunch", () => ({ resolveGrokCommand: native.resolve, grokLaunchArgs: () => ["owned-plan-launch"] }));
import { grokModelCatalog } from "./grokModelCatalog";

describe("Grok pre-task model discovery", () => {
	it.each([true, false])("initializes without authentication, sessions or prompts (%s)", async valid => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); native.resolve.mockResolvedValue({ executable: "/owned/grok", prefix: [] });
		const initialize = vi.fn(); const session = vi.fn(() => ({ sessionId: "unexpected" })); const prompt = vi.fn(() => ({ stopReason: "end_turn" as const }));
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => { initialize(params); return { protocolVersion: params.protocolVersion, agentCapabilities: {}, _meta: { grokShell: valid, modelState: { currentModelId: "native", availableModels: [{ modelId: "native", name: "Native", _meta: { privateToken: "never-return" } }] } } }; }).onRequest("session/new", session).onRequest("session/prompt", prompt).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			const result = grokModelCatalog("/owned/project");
			if (valid) expect(await result).toEqual([{ id: "native", name: "Native", default: true }]); else await expect(result).rejects.toThrow("unsupported");
			expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ clientCapabilities: expect.objectContaining({ fs: { readTextFile: false, writeTextFile: false }, terminal: false }) }));
			expect(session).not.toHaveBeenCalled(); expect(prompt).not.toHaveBeenCalled(); expect(child.kill).toHaveBeenCalled();
		} finally { connection.close(); }
	});
});
