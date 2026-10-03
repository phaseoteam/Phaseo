import { EventEmitter } from "node:events";
import type * as ChildProcessModule from "node:child_process";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ discover: vi.fn(), stop: vi.fn(), spawn: vi.fn(), resolve: vi.fn() }));
vi.mock("@opencode/client/service", () => ({ Service: { discover: mocks.discover, stop: mocks.stop, headers: () => ({}) } }));
vi.mock("node:child_process", async importOriginal => ({ ...await importOriginal<typeof ChildProcessModule>(), spawn: mocks.spawn }));
vi.mock("./nativeProcess", () => ({ resolveNativeCommand: mocks.resolve }));
import { OpenCodeService, resolveOpenCodeCommand } from "./openCodeService";

function fixture() {
	const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, kill: vi.fn() });
	child.kill.mockImplementation(() => { child.exitCode = 0; child.emit("close", 0); return true; });
	mocks.spawn.mockReturnValue(child); return child;
}
const endpoint = { url: "http://localhost:4096", auth: { type: "basic" as const, username: "opencode", password: "fixture-service-token" } };
describe("OpenCode service lifecycle", () => {
	beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); mocks.stop.mockResolvedValue(undefined); });
	it("does not start a service while releasing unused workspace tools", async () => {
		mocks.discover.mockResolvedValue(undefined);
		const resolve = vi.fn(); const service = new OpenCodeService(tmpdir(), resolve);
		const synchronize = vi.spyOn(service.mcp, "synchronize").mockResolvedValue(undefined);
		await service.releaseMcp("fixture", "project", [{ id: "fixture", enabled: true } as never]);
		expect(synchronize).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("releases managed connections once per service without changing stored configuration", async () => {
		mocks.discover.mockResolvedValue(endpoint); const service = new OpenCodeService(tmpdir(), vi.fn());
		const synchronize = vi.spyOn(service.mcp, "synchronize").mockResolvedValue(undefined);
		const connections = [{ id: "fixture", enabled: true } as never];
		await service.releaseMcp("fixture", "project", connections);
		expect(synchronize).toHaveBeenCalledOnce(); expect(synchronize.mock.lastCall?.slice(1, 5)).toEqual([endpoint.url, "fixture", "project", [{ id: "fixture", enabled: false }]]);
		expect(connections[0]).toEqual({ id: "fixture", enabled: true }); expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("reuses compatible external services without taking ownership", async () => {
		mocks.discover.mockResolvedValue(endpoint);
		const service = new OpenCodeService(tmpdir(), vi.fn());
		expect(await service.connect()).toEqual(endpoint); await service.close();
		expect(mocks.spawn).not.toHaveBeenCalled(); expect(mocks.stop).not.toHaveBeenCalled();
	});
	it("shares startup, uses its own registration and stops only its managed service", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-service-")); const child = fixture();
		mocks.discover.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValue(endpoint);
		const resolveCommand = vi.fn(async () => ({ executable: "fixture", prefix: [], version: "2.0.22" }));
		const service = new OpenCodeService(root, resolveCommand);
		try {
			const endpoints = await Promise.all([service.connect(), service.connect()]); expect(endpoints).toEqual([endpoint, endpoint]);
			expect(resolveCommand).toHaveBeenCalledOnce(); expect(mocks.spawn).toHaveBeenCalledOnce();
			expect(mocks.spawn.mock.lastCall?.[2]).toMatchObject({ windowsHide: true, shell: false, env: { XDG_STATE_HOME: path.join(root, "native", "opencode", "state") } });
			await service.close(); expect(child.kill).toHaveBeenCalled(); expect(mocks.stop).toHaveBeenCalledWith({ file: path.join(root, "native", "opencode", "state", "opencode", "service.json") });
		} finally { await service.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("cancels one startup caller while another can finish", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-service-cancel-")); fixture(); mocks.discover.mockResolvedValue(undefined);
		const service = new OpenCodeService(root, async () => ({ executable: "fixture", prefix: [], version: "2.0.22" })); const controller = new AbortController();
		try {
			const cancelled = expect(service.connect(controller.signal)).rejects.toThrow("cancelled");
			await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled()); controller.abort(); await cancelled;
			mocks.discover.mockResolvedValue(endpoint); expect(await service.connect()).toEqual(endpoint);
		} finally { await service.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("aborts shared initialization and releases its process during shutdown", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-service-shutdown-")); const child = fixture(); mocks.discover.mockResolvedValue(undefined);
		const service = new OpenCodeService(root, async () => ({ executable: "fixture", prefix: [], version: "2.0.22" }));
		try {
			const stopped = expect(service.connect()).rejects.toThrow(/aborted|cancelled/); await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
			await service.close(); await stopped; expect(child.kill).toHaveBeenCalled();
			await expect(service.connect()).rejects.toThrow("cancelled");
		} finally { await service.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it.each(["1.18.31", "2.0.22"])("verifies executable versions before service startup (%s)", async version => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-version-")); const script = path.join(root, "version.cjs"); writeFileSync(script, `console.log('opencode v${version}')`);
		mocks.resolve.mockResolvedValue({ executable: process.execPath, prefix: [script] });
		try {
			if (version.startsWith("2.")) expect(await resolveOpenCodeCommand(root)).toMatchObject({ version });
			else await expect(resolveOpenCodeCommand(root)).rejects.toThrow("OpenCode 1 is not compatible");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
