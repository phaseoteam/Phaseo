import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const discovery = vi.hoisted(() => ({ exists: vi.fn(), resolve: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: discovery.exists }));
vi.mock("node:os", () => ({ homedir: () => "/owned/home" }));
vi.mock("./nativeProcess", () => ({ resolveNativeCommand: discovery.resolve }));
import { resolveGrokCommand } from "./grokLaunch";

describe("Grok native binary discovery", () => {
	beforeEach(() => { vi.clearAllMocks(); discovery.exists.mockReturnValue(false); discovery.resolve.mockResolvedValue({ executable: "/owned/path/grok", prefix: [] }); });
	afterEach(() => vi.unstubAllEnvs());
	it("prefers the official native binary instead of its npm bootstrap", async () => {
		vi.stubEnv("GROK_HOME", "/owned/install"); discovery.exists.mockReturnValue(true);
		const executable = path.join("/owned/install", "bin", process.platform === "win32" ? "grok.exe" : "grok");
		expect(await resolveGrokCommand()).toEqual({ executable, prefix: [] });
		expect(discovery.exists).toHaveBeenCalledWith(executable); expect(discovery.resolve).not.toHaveBeenCalled();
	});
	it("uses the canonical home installation when GROK_HOME is absent", async () => {
		vi.stubEnv("GROK_HOME", undefined); discovery.exists.mockReturnValue(true);
		expect(await resolveGrokCommand()).toEqual({ executable: path.join("/owned/home", ".grok", "bin", process.platform === "win32" ? "grok.exe" : "grok"), prefix: [] });
	});
	it("falls back to native command discovery without enabling an npm bootstrap", async () => {
		expect(await resolveGrokCommand()).toEqual({ executable: "/owned/path/grok", prefix: [] });
		expect(discovery.resolve).toHaveBeenCalledExactlyOnceWith("grok");
	});
	it("reports a missing native installation", async () => {
		discovery.resolve.mockRejectedValueOnce(new Error("Missing installation"));
		await expect(resolveGrokCommand()).rejects.toThrow("Missing installation");
	});
});
