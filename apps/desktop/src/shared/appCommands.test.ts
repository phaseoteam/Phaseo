import { describe, expect, it } from "vitest";
import { agentAppCommands, appCommands, paletteEntries, validateAppCommand } from "./appCommands";

describe("app command registry", () => {
	it("checks commands and arguments against the registry", () => {
		expect(() => validateAppCommand("window.close", {}, "person")).toThrow("Unknown app command");
		expect(() => validateAppCommand("pane.open", {}, "agent")).toThrow("needs surface");
		expect(() => validateAppCommand("pane.open", { surface: "kitchen" }, "agent")).toThrow("must be one of");
		expect(() => validateAppCommand("pane.open", { surface: "terminal", size: "big" }, "agent")).toThrow("takes no size");
		expect(() => validateAppCommand("sidebar.set", { open: "yes" }, "agent")).toThrow("true or false");
		expect(() => validateAppCommand("toast.show", { title: "x".repeat(121) }, "agent")).toThrow("longer than");
		expect(validateAppCommand("pane.open", { surface: "terminal" }, "agent").args).toEqual({ surface: "terminal" });
		expect(() => validateAppCommand("settings.set", { key: "theme" }, "agent")).toThrow("needs value");
		expect(validateAppCommand("settings.set", { key: "autoSettleAfterDays", value: null }, "agent").args).toEqual({ key: "autoSettleAfterDays", value: null });
		expect(() => validateAppCommand("settings.set", { key: "worktreeCleanup", value: { notes: "x".repeat(20001) } }, "agent")).toThrow("too large");
	});

	it("keeps person-only commands from agents and out of list_app_commands", () => {
		expect(() => validateAppCommand("operator.resume", undefined, "agent")).toThrow("for the person only");
		expect(validateAppCommand("operator.resume", undefined, "person").command.id).toBe("operator.resume");
		const listed = agentAppCommands().map(command => command.id);
		expect(listed).toContain("operator.pause");
		expect(listed).not.toContain("operator.resume");
		expect(agentAppCommands("usage").map(command => command.id)).toEqual(["usage.open"]);
	});

	it("has unique ids, and every palette entry is a valid run of a registry command", () => {
		expect(new Set(appCommands.map(command => command.id)).size).toBe(appCommands.length);
		for (const entry of paletteEntries) expect(() => validateAppCommand(entry.command, entry.args, "person")).not.toThrow();
	});
});
