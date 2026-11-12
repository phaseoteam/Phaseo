import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as OpenCodeModule from "@opencode/client";
const sdk = vi.hoisted(() => ({ make: vi.fn() }));
vi.mock("@opencode/client", async importOriginal => ({ ...await importOriginal<typeof OpenCodeModule>(), OpenCode: { make: sdk.make } }));
vi.mock("@opencode/client/service", () => ({ Service: { discover: async () => null, stop: async () => {}, headers: () => ({}) } }));
import { OpenCodeMcp } from "./openCodeMcp";
import { WorkspaceRuntime } from "./workspaceRuntime";

describe("OpenCode through the workspace runtime", () => {
	afterEach(() => { vi.restoreAllMocks(); });
	it.each([[true, "1"], [false, undefined]] as const)("starts the turn's service without the checkout's own config only for someone else's checkout (untrusted: %s)", async (untrusted, disabled) => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-opencode-runtime-"));
		// The real adapter and service, up to the process: the service's spawn is where the environment is set.
		const runtime = new WorkspaceRuntime(directory);
		vi.spyOn(OpenCodeMcp.prototype, "synchronize").mockResolvedValue(undefined);
		const spawnService = vi.spyOn(runtime.openCode as unknown as { spawnService: (...args: unknown[]) => Promise<{ url: string }> }, "spawnService").mockResolvedValue({ url: "http://127.0.0.1:5000" });
		let prompted!: () => void; const prompt = new Promise<void>(resolve => { prompted = resolve; });
		sdk.make.mockReturnValue({ model: { list: async () => ({ data: [] }) }, session: { create: async () => ({ id: "session" }), prompt: async () => { prompted(); }, wait: async () => {} }, event: { subscribe: async function* (options: { onActivity: () => void }) { options.onActivity(); await prompt; yield { type: "session.execution.succeeded", data: { sessionID: "session" } }; } } });
		try {
			const id = (await runtime.command({ type: "create-task", harness: "opencode", model: "default", mode: "code", permissionMode: "full-access", ...(untrusted ? { untrustedCheckout: true as const } : {}) })).tasks[0]!.id;
			await runtime.command({ type: "send", id, text: "Fix it" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			expect(spawnService).toHaveBeenCalledOnce();
			expect((spawnService.mock.lastCall?.[5] as Record<string, string> | undefined)?.OPENCODE_DISABLE_PROJECT_CONFIG).toBe(disabled);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
