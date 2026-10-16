import { describe, expect, it } from "vitest";
import { autoSettleRules, importableScripts, newScriptId, normalisePreviewUrl, parseT3ProjectFile, projectIdentity, scriptFromProjectFile, validateProjectIcon, projectActionCommands, primaryScript, scriptMenuLabel, settingsProject, settleScriptTarget, validateProjectSettings, validateProjectUpdate, worktreeCreateScripts, type ProjectScript } from "./projectSettings";

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

describe("project action commands", () => {
	it("gives each project action a shortcut command; worktrees use their project's", () => {
		const projects = [
			{ id: "p1", name: "Web", directory: "/web", settings: { scripts: [script(), script({ id: "test", name: "Test" })] } },
			{ id: "w1", name: "Web · fix", directory: "/w", worktree: { sourceProjectId: "p1" }, settings: { scripts: [script({ id: "own" })] } },
			{ id: "p2", name: "Api", directory: "/api" },
		];
		expect(projectActionCommands(projects)).toEqual([
			{ command: "script.p1.dev.run", label: "Run Dev server in Web", group: "Project actions", keys: [] },
			{ command: "script.p1.test.run", label: "Run Test in Web", group: "Project actions", keys: [] },
		]);
	});
});

describe("action preview URLs", () => {
	it("keeps a web preview URL, adds http:// as T3 does, and drops auto-open without one", () => {
		const [kept] = validateProjectSettings({ scripts: [script({ previewUrl: " localhost:5173 ", autoOpenPreview: true })] }).scripts!;
		expect(kept).toMatchObject({ previewUrl: "http://localhost:5173/", autoOpenPreview: true });
		expect(validateProjectSettings({ scripts: [script({ previewUrl: "https://app.test/path", autoOpenPreview: false })] }).scripts![0]).toEqual({ ...script(), previewUrl: "https://app.test/path" });
		expect(validateProjectSettings({ scripts: [script({ previewUrl: " ", autoOpenPreview: true })] }).scripts![0]).toEqual(script());
		expect(normalisePreviewUrl("127.0.0.1:3000/app")).toBe("http://127.0.0.1:3000/app");
		expect(() => normalisePreviewUrl("file:///C:/x")).toThrow("http or https");
		expect(() => normalisePreviewUrl("https://user:pw@example.com")).toThrow("user name");
		expect(() => validateProjectSettings({ scripts: [script({ autoOpenPreview: "yes" as never })] })).toThrow("Invalid project script");
	});
});

describe("project icons", () => {
	it("accepts T3's icon kinds and refuses anything else", () => {
		expect(validateProjectIcon({ kind: "lucide", name: "folder-code", color: "blue" })).toEqual({ kind: "lucide", name: "folder-code", color: "blue" });
		expect(validateProjectIcon({ kind: "emoji", emoji: " 🚀 " })).toEqual({ kind: "emoji", emoji: "🚀" });
		expect(validateProjectIcon({ kind: "monogram", text: " ph ", color: "rose" })).toEqual({ kind: "monogram", text: "PH", color: "rose" });
		expect(() => validateProjectIcon({ kind: "monogram", text: "abc", color: "rose" })).toThrow("one or two");
		expect(() => validateProjectIcon({ kind: "lucide", name: "../x", color: "blue" })).toThrow("Invalid project icon");
		expect(() => validateProjectIcon({ kind: "lucide", name: "folder", color: "beige" })).toThrow("Invalid project icon");
		expect(() => validateProjectIcon({ kind: "emoji", emoji: "🚀🚀" })).toThrow("Invalid project icon");
		expect(validateProjectSettings({ icon: { kind: "emoji", emoji: "🧪" } })).toEqual({ icon: { kind: "emoji", emoji: "🧪" } });
	});
	it("derives T3's automatic monogram and a stable colour from the name", () => {
		expect(projectIdentity("phaseo").monogram).toBe("PO");
		expect(projectIdentity("my app").monogram).toBe("MA");
		expect(projectIdentity("web3 site").monogram).toBe("W3");
		expect(projectIdentity("").monogram).toBe("PR");
		expect(projectIdentity("phaseo").color).toBe(projectIdentity(" phaseo ").color);
	});
});

describe("t3.json", () => {
	const file = { scripts: [{ name: " Dev ", command: "pnpm dev", icon: "play", previewUrl: "http://localhost:3000", autoOpenPreview: true }, { name: "Test", command: "pnpm test", runOnWorktreeCreate: false }] };
	it("reads its scripts, and treats one bad entry as an invalid file", () => {
		expect(parseT3ProjectFile(JSON.stringify(file))).toEqual([{ name: "Dev", command: "pnpm dev", icon: "play", previewUrl: "http://localhost:3000", autoOpenPreview: true }, { name: "Test", command: "pnpm test" }]);
		expect(parseT3ProjectFile("{\"$schema\": \"https://t3.codes/schema/t3.json\"}")).toEqual([]);
		expect(() => parseT3ProjectFile("{ nope")).toThrow();
		expect(() => parseT3ProjectFile(JSON.stringify({ scripts: [{ name: "x", command: "y", icon: "rocket" }] }))).toThrow("unknown icon");
		expect(() => parseT3ProjectFile(JSON.stringify({ scripts: [{ name: "x" }] }))).toThrow("command");
		expect(() => parseT3ProjectFile(JSON.stringify({ scripts: "dev" }))).toThrow("list");
	});
	it("offers only scripts not already saved by command or name, with T3's defaults", () => {
		const scripts = parseT3ProjectFile(JSON.stringify(file));
		expect(importableScripts(scripts, [script({ name: "dev", command: "other" })]).map(item => item.name)).toEqual(["Test"]);
		expect(importableScripts(scripts, [script({ name: "Other", command: "pnpm test" })]).map(item => item.name)).toEqual(["Dev"]);
		expect(scriptFromProjectFile(scripts[1])).toEqual({ name: "Test", command: "pnpm test", icon: "play", runOnWorktreeCreate: false });
		expect(scriptFromProjectFile(scripts[0])).toMatchObject({ previewUrl: "http://localhost:3000", autoOpenPreview: true });
	});
});

describe("project merge method", () => {
	it("keeps a project's default merge method and refuses unknown ones", () => {
		expect(validateProjectSettings({ pullRequestMergeMethod: "squash" })).toEqual({ pullRequestMergeMethod: "squash" });
		expect(validateProjectSettings({})).toEqual({});
		expect(() => validateProjectSettings({ pullRequestMergeMethod: "octopus" })).toThrow("merge method");
	});
});
