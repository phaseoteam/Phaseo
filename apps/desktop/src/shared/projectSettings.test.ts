import { describe, expect, it } from "vitest";
import { autoSettleRules, newScriptId, primaryScript, scriptMenuLabel, settingsProject, settleScriptTarget, validateProjectSettings, validateProjectUpdate, worktreeCreateScripts, type ProjectScript } from "./projectSettings";

const script = (patch: Partial<ProjectScript> = {}): ProjectScript => ({ id: "dev", name: "Dev server", command: "pnpm dev", icon: "play", runOnWorktreeCreate: false, ...patch });
const preferences = { autoSettleAfterDays: 3, autoSettleOnMerge: true, keepPullRequests: false };

describe("project settings", () => {
	it("validates names, overrides and scripts, and trims what it keeps", () => {
		expect(validateProjectUpdate({ id: "p", name: "  Web  " })).toEqual({ id: "p", name: "Web" });
		expect(() => validateProjectUpdate({ id: "p", name: " " })).toThrow("name");
		expect(() => validateProjectUpdate({ id: "p", name: "a\u0007b" })).toThrow("name");
		expect(validateProjectSettings({ autoSettleAfterDays: null, autoSettleOnMerge: false })).toEqual({ autoSettleAfterDays: null, autoSettleOnMerge: false });
		expect(() => validateProjectSettings({ autoSettleAfterDays: 0 })).toThrow("whole number of days");
		expect(() => validateProjectSettings({ keepPullRequests: "yes" })).toThrow("auto-settle");
		expect(validateProjectSettings({ scripts: [{ ...script(), name: " Dev ", command: " pnpm dev\n", runOnSettle: false }] }).scripts).toEqual([{ id: "dev", name: "Dev", command: "pnpm dev", icon: "play", runOnWorktreeCreate: false }]);
		expect(() => validateProjectSettings({ scripts: [script(), script()] })).toThrow("Invalid project script");
		expect(() => validateProjectSettings({ scripts: [script({ icon: "rocket" as never })] })).toThrow("icon");
		expect(() => validateProjectSettings({ scripts: [script({ runOnSettle: true }), script({ id: "b", runOnSettle: true })] })).toThrow("Only one script");
		expect(() => validateProjectSettings({ scripts: [script({ command: "" })] })).toThrow("command");
		expect(() => validateProjectSettings({ scripts: [script({ id: "../x" })] })).toThrow("Invalid project script");
		expect(validateProjectSettings({ scripts: [] })).toEqual({});
	});

	it("inherits each auto-settle setting it does not override, with null meaning never", () => {
		expect(autoSettleRules(preferences)).toEqual({ days: 3, onMerge: true, keepPullRequests: false });
		expect(autoSettleRules(preferences, { autoSettleAfterDays: null, keepPullRequests: true })).toEqual({ days: null, onMerge: true, keepPullRequests: true });
		expect(autoSettleRules({ ...preferences, autoSettleAfterDays: null }, { autoSettleAfterDays: 7, autoSettleOnMerge: false })).toEqual({ days: 7, onMerge: false, keepPullRequests: false });
	});

	it("gives worktrees their source project's settings", () => {
		const projects = [{ id: "root", name: "Web", directory: "/web", settings: { scripts: [script({ runOnWorktreeCreate: true }), script({ id: "test", runOnSettle: true })] } }, { id: "tree", name: "Web · fix", directory: "/trees/1", worktree: { sourceProjectId: "root" } }];
		expect(settingsProject(projects, "tree")?.id).toBe("root");
		expect(settingsProject(projects, "missing")).toBeUndefined();
		expect(worktreeCreateScripts(projects, "tree").map(value => value.id)).toEqual(["dev"]);
	});

	it("runs settle scripts only in the chat's own worktree", () => {
		const projects = [{ id: "root", name: "Web", directory: "/web", settings: { scripts: [script(), script({ id: "clean", runOnSettle: true })] } }, { id: "tree", name: "Web · fix", directory: "/trees/1", worktree: { sourceProjectId: "root" } }, { id: "gone", name: "Old", directory: "/trees/2", worktree: { sourceProjectId: "root", removedAt: "2026-10-01T00:00:00Z" } }];
		const chat = { id: "a", projectId: "tree", archived: false, settledOverride: "settled" as const };
		expect(settleScriptTarget(chat, projects, [chat])).toEqual({ directory: "/trees/1", script: expect.objectContaining({ id: "clean" }) });
		expect(settleScriptTarget({ ...chat, projectId: "root" }, projects, [])).toBeUndefined();
		expect(settleScriptTarget({ ...chat, projectId: "gone" }, projects, [])).toBeUndefined();
		// Another open chat in the same worktree makes it shared; settled, archived and delegated ones do not.
		expect(settleScriptTarget(chat, projects, [chat, { id: "b", projectId: "tree", archived: false }])).toBeUndefined();
		expect(settleScriptTarget(chat, projects, [chat, { id: "b", projectId: "tree", archived: false, settledOverride: "settled" }, { id: "c", projectId: "tree", archived: true }, { id: "d", projectId: "tree", archived: false, delegation: { parentTaskId: "a" } }])).toBeDefined();
		expect(settleScriptTarget(chat, [projects[0], { ...projects[1], settings: undefined }].map(value => value.id === "root" ? { ...value, settings: { scripts: [script()] } } : value), [chat])).toBeUndefined();
	});

	it("picks T3's one-click script and labels script roles", () => {
		expect(primaryScript([script({ id: "setup", runOnWorktreeCreate: true }), script({ id: "test" })])?.id).toBe("test");
		expect(primaryScript([script({ id: "setup", runOnWorktreeCreate: true }), script({ id: "clean", runOnSettle: true })])?.id).toBe("setup");
		expect(primaryScript([script({ runOnSettle: true })])).toBeUndefined();
		expect(scriptMenuLabel(script({ runOnWorktreeCreate: true, runOnSettle: true }))).toBe("Dev server (setup, on settle)");
	});

	it("makes script ids from names without reusing one", () => {
		expect(newScriptId("Dev server", [])).toBe("dev-server");
		expect(newScriptId("Dev server", [script({ id: "dev-server" })])).toBe("dev-server-2");
		expect(newScriptId("!!!", [])).toBe("script");
	});
});
