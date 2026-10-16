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
			expect(["get_state", "get_available_models"]).toContain(request.type);
			if (request.type === "get_state") child.stdout.write(JSON.stringify({ type: "response", id: request.id, success: false, error: "Unsupported" }) + "\n");
			else child.stdout.write(JSON.stringify({ type: "response", id: request.id, success: true, data: { models: valid ? [{ provider: "native", id: "model", name: "Native Model" }, { id: 42 }, null] : {} } }) + "\n");
		});
		mocks.spawn.mockResolvedValue(child);
		if (valid) expect(await piModels("/project")).toEqual([{ id: "native/model", name: "Native Model", description: "native" }]);
		else await expect(piModels("/project")).rejects.toThrow("invalid model catalog");
		expect(mocks.spawn.mock.lastCall?.slice(0, 3)).toEqual(["pi", ["--mode", "rpc", "--no-tools", "--no-session"], "/project"]);
		expect(child.kill).toHaveBeenCalledOnce();
	});
	it("offers each Pi reasoning model's thinking levels with Pi's configured level clamped as the default", async () => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
		child.stdin.on("data", chunk => {
			const request = JSON.parse(chunk.toString());
			const data = request.type === "get_state" ? { thinkingLevel: "xhigh" } : { models: [
				{ provider: "a", id: "plain", reasoning: false },
				{ provider: "a", id: "standard", reasoning: true },
				{ provider: "a", id: "mapped", reasoning: true, thinkingLevelMap: { off: null, minimal: null, xhigh: "xhigh", max: null } },
			] };
			child.stdout.write(JSON.stringify({ type: "response", id: request.id, success: true, data }) + "\n");
		});
		mocks.spawn.mockResolvedValue(child);
		const [plain, standard, mapped] = await piModels("/project");
		expect(plain.options).toBeUndefined();
		expect(standard.options).toEqual([{ id: "thinking", label: "Thinking", type: "select", options: [{ id: "off", label: "Off" }, { id: "minimal", label: "Minimal" }, { id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High", isDefault: true }] }]);
		expect(mapped.options).toEqual([{ id: "thinking", label: "Thinking", type: "select", options: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }, { id: "xhigh", label: "Extra High", isDefault: true }] }]);
	});
	it("offers OpenCode reasoning variants with T3's provider defaults and nothing for variant-less models", async () => {
		mocks.discover.mockResolvedValue({ url: "http://localhost:4096" });
		const model = (providerID: string, id: string, variants: string[]) => ({ id, providerID, name: id, enabled: true, status: "active", limit: { context: 1 }, variants: variants.map(variant => ({ id: variant })) });
		mocks.make.mockReturnValue({ model: { list: async () => ({ data: [model("openai", "gpt", ["low", "medium", "high", "x_high"]), model("anthropic", "claude", ["high", "max"]), model("other", "solo", ["thinking"]), model("other", "many", ["low", "high"]), model("other", "none", [])] }) } });
		const [gpt, claude, solo, many, none] = await openCodeModels("/project");
		expect(gpt.options).toEqual([{ id: "variant", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }, { id: "x_high", label: "X High" }] }]);
		expect(claude.options?.[0]).toMatchObject({ options: [{ id: "high", isDefault: true }, { id: "max" }] });
		expect(solo.options?.[0]).toMatchObject({ options: [{ id: "thinking", label: "Thinking", isDefault: true }] });
		expect(many.options?.[0]).toEqual({ id: "variant", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low" }, { id: "high", label: "High" }] });
		expect(none.options).toBeUndefined();
	});
});
