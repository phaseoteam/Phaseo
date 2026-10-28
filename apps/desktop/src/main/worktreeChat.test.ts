import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProjectScript } from "../shared/projectSettings";
import type { WorktreeSetup } from "../shared/worktreeChat";
import { runWorktreeSetup, type WorktreeSetupHost } from "./worktreeChat";
import { WorkspaceRuntime } from "./workspaceRuntime";

const script = (id: string): ProjectScript => ({ id, name: id, command: `echo ${id}`, icon: "play", runOnWorktreeCreate: true });
function host(overrides: Partial<WorktreeSetupHost> = {}) {
	const setup: WorktreeSetup = { base: "main", branch: "phaseo/abcdef01", startedAt: "", stages: [{ id: "checkout", status: "done" }, { id: "branch", status: "pending" }, { id: "setup", status: "pending" }] };
	const renames: [string, string][] = [];
	const value: WorktreeSetupHost = { branches: async () => ["main", "phaseo/abcdef01", "phaseo/fix-login"], renameBranch: async (from, to) => { renames.push([from, to]); }, nameBranch: async () => undefined, setupScripts: () => [], runScript: () => ({ terminalId: "t", exited: Promise.resolve(0) }), update: mutate => mutate(setup), cancelled: () => false, ...overrides };
	return { value, setup, renames };
}

describe("worktree chat setup", () => {
	it("renames the temporary branch from the title model's name, avoiding taken names", async () => {
		const { value, setup, renames } = host({ nameBranch: async () => "fix-login" });
		expect(await runWorktreeSetup(value, "phaseo/abcdef01", "Fix the login error")).toBe(true);
		expect(renames).toEqual([["phaseo/abcdef01", "phaseo/fix-login-2"]]);
		expect(setup.branch).toBe("phaseo/fix-login-2");
		expect(setup.stages.map(stage => stage.status)).toEqual(["done", "done", "skipped"]);
		expect(setup.finishedAt).toBeTruthy();
	});

	it("falls back to the message's words, and keeps the temporary branch if the rename fails", async () => {
		const named = host();
		await runWorktreeSetup(named.value, "phaseo/abcdef01", "Add dark mode");
		expect(named.renames).toEqual([["phaseo/abcdef01", "phaseo/add-dark-mode"]]);
		const failing = host({ renameBranch: async () => { throw new Error("locked"); } });
		expect(await runWorktreeSetup(failing.value, "phaseo/abcdef01", "Add dark mode")).toBe(true);
		expect(failing.setup.branch).toBe("phaseo/abcdef01");
		expect(failing.setup.stages[1]).toMatchObject({ status: "failed", detail: "Kept phaseo/abcdef01: locked" });
	});

	it("runs setup actions in turn and stops at one that fails", async () => {
		const ran: string[] = [];
		const { value, setup } = host({ setupScripts: () => [script("install"), script("build"), script("seed")], runScript: item => { ran.push(item.id); return { terminalId: item.id, exited: Promise.resolve(item.id === "build" ? 2 : 0) }; } });
		expect(await runWorktreeSetup(value, "phaseo/abcdef01", "Go")).toBe(false);
		expect(ran).toEqual(["install", "build"]);
		expect(setup.script).toMatchObject({ name: "build", terminalId: "build", exitCode: 2 });
		expect(setup.error).toBe("build exited with code 2. Fix it in its terminal, then resume the chat.");
		expect(setup.stages[2].status).toBe("failed");
	});

	it("does not start the agent when the chat was stopped", async () => {
		let stopped = false;
		const { value } = host({ setupScripts: () => [script("install")], runScript: () => ({ terminalId: "t", exited: Promise.resolve(0).then(code => { stopped = true; return code; }) }), cancelled: () => stopped });
		expect(await runWorktreeSetup(value, "phaseo/abcdef01", "Go")).toBe(false);
	});

	it("holds the first turn in a real worktree until setup finishes", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-worktree-chat-")), root = path.join(directory, "repository"); mkdirSync(root);
		const git = (args: string[], cwd = root) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
		git(["init", "-b", "main"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]);
		writeFileSync(path.join(root, "file.txt"), "Committed\n"); git(["add", "file.txt"]); git(["commit", "-m", "Fixture"]);
		const runs: string[] = [];
		const runtime = new WorkspaceRuntime(path.join(directory, "workspace"), () => ({ run: async () => { runs.push("turn"); }, cancel: async () => {} }));
		let finishSetup!: (code: number) => void;
		runtime.runSetupScript = () => ({ terminalId: "terminal", exited: new Promise(resolve => { finishSetup = resolve; }) });
		let checkout: string | undefined;
		try {
			const source = runtime.store.addProject(root); source.settings = { scripts: [script("install")] }; runtime.store.saveProject(source);
			const { taskId } = await runtime.startWorktreeChat({ projectId: source.id, base: "main", text: "Add dark mode" }, { type: "create-task", harness: "codex", model: "default", mode: "code" });
			const project = () => runtime.store.getProjects().find(value => value.id === runtime.store.getTask(taskId).projectId)!;
			checkout = project().directory;
			await runtime.command({ type: "send", id: taskId, text: "Add dark mode" });
			await vi.waitFor(() => expect(runtime.store.getTask(taskId).worktreeSetup?.stages[2].status).toBe("running"));
			expect(runs).toEqual([]);
			expect(project().worktree?.branch).toBe("phaseo/add-dark-mode");
			expect(git(["branch", "--show-current"], checkout)).toBe("phaseo/add-dark-mode");
			expect(project().name).toBe("repository · phaseo/add-dark-mode");
			finishSetup(0);
			await vi.waitFor(() => expect(runs).toEqual(["turn"]));
			expect(runtime.store.getTask(taskId).worktreeSetup?.finishedAt).toBeTruthy();
		} finally {
			await runtime.close();
			if (checkout) { git(["worktree", "remove", checkout]); git(["worktree", "prune"]); }
			rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		}
	}, 30000);
});
