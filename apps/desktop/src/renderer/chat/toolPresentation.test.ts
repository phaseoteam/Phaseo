import { describe, expect, it } from "vitest";
import { presentTool, summarizeTools, thoughtLine } from "./toolPresentation";

const claude = (title: string, input: unknown, status: "running" | "completed" | "failed" = "completed", output = "ok") => ({ title, status, text: status === "running" ? JSON.stringify(input) : `${JSON.stringify(input)}\n\n${output}` });

describe("tool rows in plain language", () => {
	it("names what Claude Code's tools did, with their target", () => {
		expect(presentTool(claude("Bash", { command: "git status --short" })).label).toBe("Ran git status --short");
		expect(presentTool(claude("Read", { file_path: String.raw`E:\repo\apps\desktop\src\main.ts` }, "running")).label).toBe("Reading desktop/src/main.ts");
		expect(presentTool(claude("Grep", { pattern: "accent" })).label).toBe("Searched for “accent”");
		expect(presentTool(claude("Glob", { pattern: "**/*" })).label).toBe("Found files matching **/*");
		expect(presentTool(claude("ToolSearch", { query: "select:mcp__phaseo_1__run_app_command" })).label).toBe("Loaded tools");
	});
	it("says which setting an app command changed and to what", () => {
		const tool = "mcp__phaseo_79d2dbc7__run_app_command";
		expect(presentTool(claude(tool, { command: "settings.set", args: { key: "theme", value: "dark" } }))).toEqual({ label: "Changed theme to dark", action: "app-change" });
		expect(presentTool(claude(tool, { command: "settings.set", args: { key: "theme", value: "dark" } }, "running")).label).toBe("Changing theme");
		expect(presentTool(claude(tool, { command: "config.set", args: { area: "themes", value: { dark: { accent: "#ff5500" } } } })).label).toBe("Changed colour themes (dark accent #ff5500)");
		expect(presentTool(claude(tool, { command: "config.get", args: { area: "mcp" } }))).toEqual({ label: "Checked MCP servers", action: "app-read" });
		expect(presentTool(claude("mcp__phaseo_1__list_app_commands", { query: "theme" })).label).toBe("Looked up app commands");
	});
	it("reads a Codex command title and falls back to a readable tool name", () => {
		expect(presentTool({ title: "pwsh -Command Get-ChildItem", text: "", status: "completed" })).toEqual({ label: "Ran pwsh -Command Get-ChildItem", action: "command" });
		expect(presentTool({ title: "mcp__docs__search_docs", text: "", status: "completed" }).label).toBe("Search docs");
		expect(presentTool({ title: "Project instructions", text: "Loaded AGENTS.md", status: "completed" }).label).toBe("Project instructions");
	});
});

describe("a turn's summary line", () => {
	it("leads with changes, then lookups, and counts the rest", () => {
		const rows = [claude("ToolSearch", {}), claude("mcp__p__list_app_commands", {}), claude("mcp__p__run_app_command", { command: "settings.list" }), claude("mcp__p__run_app_command", { command: "settings.set", args: { key: "theme", value: "dark" } }), claude("mcp__p__run_app_command", { command: "config.set", args: { area: "themes" } }), claude("Bash", { command: "echo hi" })].map(presentTool);
		expect(summarizeTools(rows)).toBe("Changed 2 settings, ran 1 command and 3 other actions");
		expect(summarizeTools([claude("Read", { file_path: "a.ts" }), claude("Read", { file_path: "b.ts" })].map(presentTool))).toBe("Read 2 files");
	});
});

describe("a thought's row", () => {
	it("shows its first sentence, or its bold heading", () => {
		expect(thoughtLine("The accent lives in the theme config. I'll check its shape.")).toBe("The accent lives in the theme config.");
		expect(thoughtLine("**Checking the config**\n\nThe accent lives in the theme config.")).toBe("Checking the config");
	});
});

describe("a colour theme change", () => {
	it("names the colours it set", () => {
		expect(presentTool({ title: "mcp__p__run_app_command", status: "completed", text: JSON.stringify({ command: "config.set", args: { area: "themes", value: { dark: { accent: "#ff5500" } } } }) }).label).toBe("Changed colour themes (dark accent #ff5500)");
	});
});
