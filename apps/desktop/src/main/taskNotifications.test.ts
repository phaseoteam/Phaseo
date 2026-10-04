import { describe, expect, it, vi } from "vitest";
import { TaskNotifications } from "./taskNotifications";
import { emptyWorkspace } from "../shared/workspace";
import { workspaceOverview } from "../shared/workspaceOverview";
import { defaultPreferences, validatePreferences } from "../shared/preferences";

function fixture() {
	const close = vi.fn(); const ports = { focused: vi.fn(() => false), supported: vi.fn(() => true), show: vi.fn<(title: string, body: string, click: () => void) => () => void>(() => close), open: vi.fn() };
	const service = new TaskNotifications(ports, { notifications: "all", notificationTitles: false });
	const workspace = emptyWorkspace(); workspace.tasks = [{ id: "task", title: "Private title", status: "running", messages: [], archived: false, harness: "codex", model: "default", mode: "chat", pinned: false, queue: [], createdAt: "", updatedAt: "" }];
	service.update(workspaceOverview(workspace)); return { service, ports, workspace, close };
}
describe("desktop task notifications", () => {
	it("seeds history without alerts and reports new terminal states without private content", () => {
		const { service, ports, workspace } = fixture(); expect(ports.show).not.toHaveBeenCalled();
		workspace.tasks[0].status = "completed"; service.update(workspaceOverview(workspace)); expect(ports.show).toHaveBeenCalledWith("Phaseo", "Task completed", expect.any(Function));
		service.update(workspaceOverview(workspace)); workspace.tasks[0].inboxReadAt = "read"; workspace.tasks[0].title = "Changed title"; service.update(workspaceOverview(workspace)); expect(ports.show).toHaveBeenCalledOnce();
		ports.show.mock.calls[0][2](); expect(ports.open).toHaveBeenCalledWith("task");
	});
	it("suppresses foreground alerts without replaying them on blur", () => {
		const { service, ports, workspace } = fixture(); ports.focused.mockReturnValue(true); workspace.tasks[0].status = "failed"; service.update(workspaceOverview(workspace)); ports.focused.mockReturnValue(false); service.update(workspaceOverview(workspace)); expect(ports.show).not.toHaveBeenCalled();
	});
	it("attention mode ignores completion but reports new requests on the same task", () => {
		const { service, ports, workspace } = fixture(); service.configure({ ...defaultPreferences, notifications: "attention" }); workspace.tasks[0].status = "completed"; service.update(workspaceOverview(workspace)); expect(ports.show).not.toHaveBeenCalled();
		workspace.tasks[0].questions = [{ id: "first", questions: [] }]; service.update(workspaceOverview(workspace)); expect(ports.show).toHaveBeenCalledOnce();
		workspace.tasks[0].questions = [{ id: "second", questions: [] }]; service.update(workspaceOverview(workspace)); expect(ports.show).toHaveBeenCalledTimes(2);
	});
	it("bounds alert bursts and dismisses alerts when disabled", () => {
		const { service, ports, workspace, close } = fixture(); workspace.tasks = Array.from({ length: 10 }, (_, index) => ({ ...workspace.tasks[0], id: String(index), status: "failed" })); service.update(workspaceOverview(workspace)); expect(ports.show).toHaveBeenCalledOnce(); expect(ports.show.mock.calls[0][1]).toBe("10 tasks have updates"); ports.show.mock.calls[0][2](); expect(ports.open).toHaveBeenCalledWith(); service.configure(defaultPreferences); expect(close).toHaveBeenCalledOnce();
	});
	it("handles unsupported systems and operating-system failures without affecting tasks", () => {
		const { service, ports, workspace } = fixture(); ports.supported.mockReturnValue(false); workspace.tasks[0].status = "failed"; service.update(workspaceOverview(workspace)); expect(ports.show).not.toHaveBeenCalled(); ports.supported.mockReturnValue(true); ports.show.mockImplementation(() => { throw new Error("OS unavailable"); }); workspace.tasks[0].status = "interrupted"; expect(() => service.update(workspaceOverview(workspace))).not.toThrow(); expect(workspace.tasks[0].status).toBe("interrupted");
	});
	it("rejects unsupported preferences and defaults to private, disabled alerts", () => { expect(defaultPreferences).toEqual({ notifications: "off", notificationTitles: false }); expect(() => validatePreferences({ notifications: "all", notificationTitles: "true" })).toThrow(); });
});
