import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), discover: vi.fn(), make: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: mocks.spawn }));
vi.mock("@opencode/client", () => ({ OpenCode: { make: mocks.make } }));
vi.mock("@opencode/client/service", () => ({ Service: { discover: mocks.discover, headers: () => ({ Authorization: "native-service" }) } }));
import { openCodeModels, piModels } from "./nativeModels";

describe("native model discovery", () => {
	it("uses OpenCode project configuration and excludes disabled or deprecated models", async () => {
		mocks.discover.mockResolvedValue({ url: "http://localhost:4096" });
		const list = vi.fn(async () => ({ data: [
			{ id: "active", providerID: "provider", name: "Active", enabled: true, status: "active", limit: { context: 100000 } },
			{ id: "disabled", enabled: false, status: "active" }, { id: "old", enabled: true, status: "deprecated" },
		] }));
		mocks.make.mockReturnValue({ model: { list } });
		expect(await openCodeModels("/project")).toEqual([{ id: "provider/active", name: "Active", description: "provider · 100,000 context" }]);
		expect(list).toHaveBeenCalledWith({ location: { directory: "/project" } }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
		expect(mocks.make).toHaveBeenCalledWith({ baseUrl: "http://localhost:4096", headers: { Authorization: "native-service" } });
	});
	it("requires OpenCode V2 for catalog discovery", async () => {
		mocks.discover.mockResolvedValue(undefined);
		await expect(openCodeModels("/project")).rejects.toThrow("Start an OpenCode 2 service");
		expect(mocks.discover.mock.lastCall?.[0].version("1.18.31")).toBe(false);
	});
	it.each([true, false])("cleans up Pi catalog processes after valid or malformed responses (%s)", async valid => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
		child.stdin.on("data", chunk => {
			const request = JSON.parse(chunk.toString());
			expect(request.type).toBe("get_available_models");
			child.stdout.write(JSON.stringify({ type: "response", id: request.id, success: true, data: { models: valid ? [{ provider: "native", id: "model", name: "Native Model" }, { id: 42 }, null] : {} } }) + "\n");
		});
		mocks.spawn.mockResolvedValue(child);
		if (valid) expect(await piModels("/project")).toEqual([{ id: "native/model", name: "Native Model", description: "native" }]);
		else await expect(piModels("/project")).rejects.toThrow("invalid model catalog");
		expect(mocks.spawn.mock.lastCall?.slice(0, 3)).toEqual(["pi", ["--mode", "rpc", "--no-tools", "--no-session"], "/project"]);
		expect(child.kill).toHaveBeenCalledOnce();
	});
});
