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

describe("every tool as an English sentence", () => {
	const label = (title: string, input: unknown = {}, status: "running" | "completed" = "completed") => presentTool(claude(title, input, status)).label;
	it("says what a page step showed", () => {
		expect(label("mcp__phaseo_1__html_preview", { html: "<p>" })).toBe("Checked how the page looks");
		expect(label("mcp__phaseo_1__html_render", { title: "Quarterly sales", html: "<p>" })).toBe("Showed “Quarterly sales”");
		expect(label("html_render", { title: "Quarterly sales" }, "running")).toBe("Showing “Quarterly sales”");
	});
	it("says what happened to other chats, in the past tense once done", () => {
		expect(label("delegate_task", { title: "Review the API" })).toBe("Handed off: Review the API");
		expect(label("launch_threads", { threads: [{}, {}, {}] }, "running")).toBe("Starting 3 chats");
		expect(label("search_threads", { query: "billing" })).toBe("Searched chats for “billing”");
		expect(label("organize_thread", { action: "rename", title: "Billing fix" })).toBe("Renamed a chat to “Billing fix”");
		expect(label("organize_thread", { action: "mark_unread" })).toBe("Marked a chat unread");
		expect(label("configure_thread", { id: "a", model: "gpt" })).toBe("Changed a chat's settings");
		expect(label("configure_thread", { id: "a" })).toBe("Checked a chat's settings");
	});
	it("says what the browser and the Phaseo agent's own tools did", () => {
		expect(label("browser_open", { url: "https://example.com/pricing/" })).toBe("Opened example.com/pricing");
		expect(label("browser_set_appearance", { colorScheme: "dark" })).toBe("Switched the browser to dark mode");
		expect(label("start_background_command", { command: "pnpm dev" }, "running")).toBe("Starting pnpm dev in the background");
		expect(label("request_secret", { label: "Stripe key", reason: "x" })).toBe("Asked you for Stripe key");
		expect(label("view_image", { path: "E:/repo/docs/shots/home.png" })).toBe("Viewed docs/shots/home.png");
		expect(label("mcp", { providerIdentifier: "phaseo_1", toolName: "forecast" })).toBe("Used forecast");
		expect(presentTool({ title: "Weather · search_forecasts", text: "Sunny", status: "completed" })).toEqual({ label: "Used search forecasts from Weather", action: "other" });
	});
	it("groups pages and the browser in the turn's summary", () => {
		expect(summarizeTools([claude("html_preview", {}), claude("html_render", { title: "Sales" }), claude("Read", { file_path: "a.md" })].map(presentTool))).toBe("Showed 1 page, read 1 file and 1 other action");
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
