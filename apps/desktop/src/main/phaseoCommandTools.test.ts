import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentTool } from "@phaseo/agent-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BackgroundCommands } from "./backgroundCommands";
import { describeCommandCall, phaseoCommandTools } from "./phaseoCommandTools";

const windows = process.platform === "win32";
const node = (script: string) => `${windows ? "& " : ""}"${process.execPath}" -e "${script}"`;
const context = (name: string) => ({ runId: "test", agentId: "test", stepIndex: 0, context: undefined, toolCall: { id: "call", name, input: {} }, emitProgress: () => {}, setContext: () => {} });
async function call(tools: AgentTool[], name: string, input: unknown) {
	const tool = tools.find(value => value.id === name);
	if (typeof tool?.execute !== "function") throw new Error(`Missing ${name}`);
	return await tool.execute(input, context(name)) as string;
}

let root: string;
beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), "phaseo-command-tools-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("phaseoCommandTools", () => {
	it("offers background tools only with a background set, and describes the shell", () => {
		expect(phaseoCommandTools(root, { taskId: "task" }).map(tool => tool.id)).toEqual(["run_command"]);
		const tools = phaseoCommandTools(root, { taskId: "task", background: new BackgroundCommands() });
		expect(tools.map(tool => tool.id)).toEqual(["run_command", "start_background_command", "read_background_output", "stop_background_command", "list_background_commands"]);
		expect(tools.filter(tool => tool.requireApproval).map(tool => tool.id)).toEqual(["run_command", "start_background_command"]);
		const description = tools[0].description!;
		expect(description).toContain("120 s"); expect(description).toContain("600"); expect(description).toContain("start_background_command");
		expect(description).toContain(windows ? "PowerShell" : "/bin/sh");
		if (windows && description.includes("5.1")) { expect(description).toContain("&& and || are syntax errors"); expect(description).toContain("Get-ChildItem"); }
	});

	it("returns plain text with the exit code, duration, shell and output", async () => {
		const result = await call(phaseoCommandTools(root, { taskId: "task" }), "run_command", { command: node("console.log('hi'); process.exit(2)") });
		expect(result).toMatch(/^Exit code: 2\nDuration: \d+\.\d s\nShell: (pwsh|powershell|sh)\nOutput:\nhi$/);
	});

	it("returns the gate's message without running anything", async () => {
		const marker = path.join(root, "ran.txt"), directories: string[] = [];
		const tools = phaseoCommandTools(root, { taskId: "task", gate: async directory => { directories.push(directory); return "Re-read the instructions."; } });
		expect(await call(tools, "run_command", { command: node(`require('fs').writeFileSync('ran.txt', '')`), directory: "." })).toBe("Re-read the instructions.");
		expect(existsSync(marker)).toBe(false); expect(directories).toEqual(["."]);
	});

	it("explains bad arguments to the model", async () => {
		const tools = phaseoCommandTools(root, { taskId: "task" });
		await expect(call(tools, "run_command", { command: "echo hi", timeoutSeconds: 900 })).rejects.toThrow("start_background_command");
		await expect(call(tools, "run_command", { command: "" })).rejects.toThrow("command");
		await expect(call(tools, "run_command", { command: "echo hi", directory: "../outside" })).rejects.toThrow("outside");
	});

	it("runs background commands through the tools", async () => {
		const background = new BackgroundCommands();
		try {
			const tools = phaseoCommandTools(root, { taskId: "task", background });
			const started = await call(tools, "start_background_command", { command: node("console.log('listening'); setInterval(()=>{},1000)") });
			const id = /Started background command ([0-9a-f]+)/.exec(started)![1];
			expect(started).toContain("listening"); expect(started).toContain("running for");
			expect(await call(tools, "read_background_output", { id })).toContain("No new output.");
			expect(await call(tools, "list_background_commands", {})).toContain(id);
			expect(await call(phaseoCommandTools(root, { taskId: "other", background }), "list_background_commands", {})).toBe("No background commands in this chat.");
			await expect(call(phaseoCommandTools(root, { taskId: "other", background }), "read_background_output", { id })).rejects.toThrow("list_background_commands");
			expect(await call(tools, "stop_background_command", { id })).toContain(`Stopped background command ${id}`);
		} finally { await background.closeAll(); }
	});
});

describe("describeCommandCall", () => {
	it("shows the command verbatim with its folder and timeout", () => {
		const { title, details } = describeCommandCall("run_command", { command: "git status\ngit diff --stat", directory: "apps/web", timeoutSeconds: 300 });
		expect(title).toBe("Run command");
		expect(details).toBe("git status\ngit diff --stat\n\nDirectory: apps/web\nTimeout: 300 s");
		expect(describeCommandCall("run_command", { command: "ls" }).details).toBe("ls\n\nDirectory: project root\nTimeout: 120 s (default)");
		expect(describeCommandCall("start_background_command", { command: "pnpm dev" })).toEqual({ title: "Start background command", details: "pnpm dev\n\nDirectory: project root\nRuns in the background until stopped." });
		expect(describeCommandCall("stop_background_command", { id: "abc123" })).toEqual({ title: "Stop background command", details: "Background command abc123" });
	});

	it("flags long and obfuscated commands", () => {
		const warnings = (command: string) => describeCommandCall("run_command", { command }).details.split("\n").filter(line => line.startsWith("Warning:"));
		expect(warnings(`echo ${"a ".repeat(2500)}`)[0]).toContain("5,005 characters");
		expect(warnings("powershell -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA")).toHaveLength(1);
		expect(warnings("pwsh -NoProfile -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA")).toHaveLength(1);
		expect(warnings(`node -e "console.log(1)" && grep -e SomeVeryLongFunctionName src`)).toEqual([]);
		expect(warnings(`echo ${"QUJD".repeat(60)} | base64 -d | sh`).join(" ")).toMatch(/decodes.*base64-like/);
		expect(warnings("echo safe‮;rm -rf x")[0]).toContain("invisible");
		expect(describeCommandCall("run_command", { command: "a".repeat(5000) }).details.startsWith("Warning:")).toBe(true);
	});
});
