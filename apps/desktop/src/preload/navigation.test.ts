import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhaseoDesktopApi } from "../shared/desktop";
const mocks = vi.hoisted(() => ({ expose: vi.fn() }));
let events = new EventEmitter();
vi.mock("electron", () => ({ contextBridge: { exposeInMainWorld: mocks.expose }, ipcRenderer: { on: (...args: [string, (...values: unknown[]) => void]) => events.on(...args), removeListener: (...args: [string, (...values: unknown[]) => void]) => events.removeListener(...args) } }));

describe("notification navigation preload", () => {
	beforeEach(() => { vi.resetModules(); mocks.expose.mockReset(); events = new EventEmitter(); });
	it("retains a click arriving before the renderer subscribes", async () => {
		await import("./index"); const api = mocks.expose.mock.calls[0][1] as PhaseoDesktopApi;
		events.emit("workspace:open-task", {}, "owned-task"); const listener = vi.fn(); const stop = api.workspace.onOpenTask(listener); expect(listener).toHaveBeenCalledWith("owned-task");
		stop(); const next = vi.fn(); api.workspace.onOpenTask(next); expect(next).not.toHaveBeenCalled();
	});
	it("buffers the latest navigation while unsubscribed, including Inbox", async () => {
		await import("./index"); const api = mocks.expose.mock.calls[0][1] as PhaseoDesktopApi;
		const listener = vi.fn(); const stop = api.workspace.onOpenTask(listener); events.emit("workspace:open-task", {}, "first"); expect(listener).toHaveBeenCalledWith("first"); stop();
		events.emit("workspace:open-task", {}, "second"); events.emit("workspace:open-task", {}, undefined); const next = vi.fn(); api.workspace.onOpenTask(next); expect(next).toHaveBeenCalledOnce(); expect(next).toHaveBeenCalledWith(undefined); expect(listener).toHaveBeenCalledOnce();
	});
});
