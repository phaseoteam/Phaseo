import { phaseoMcpPool } from "./phaseoMcp";
// Servers close with their turn, so the temporary folders they run in can be removed.
phaseoMcpPool.idleMs = 0;
/** Unfinished runs also remember which instructions the model saw; these tests compare the rest. */
const withoutRevision = (context: unknown) => { const { phaseoInstructionRevision, ...rest } = (context ?? {}) as Record<string, unknown>; void phaseoInstructionRevision; return rest; };
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentModelRequest } from "@phaseo/agent-sdk";
import type { Account, Task } from "../shared/workspace";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";
import { PhaseoAdapter } from "./phaseoAdapter";
import { WorkspaceStore } from "./workspaceStore";
import { contentHash } from "./projectEdits";
import { instructionGate, ProjectInstructions } from "./projectInstructions";

const task: Task = { id: "task", title: "Owned", projectId: "project", harness: "phaseo", model: "owned", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "Owned", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" };

describe("Phaseo project instructions in the actual run loop", () => {
	it("defers a file effect requested alongside new skill guidance and runs it once the guidance is in the prompt", async () => {
		const started = performance.now(), stages: { stage: string; ms: number }[] = []; const mark = (stage: string) => stages.push({ stage, ms: Math.round(performance.now() - started) });
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-model-skill-effect-")), global = path.join(root, "instructions"), file = path.join(root, "skills", "review", "SKILL.md"); mkdirSync(global); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, "---\nname: review\ndescription: Review changes\n---\nNew model-selected guidance"); const store = new WorkspaceStore(path.join(root, "state.sqlite"));
		mark("setup");
		try {
			const generate = vi.fn().mockImplementationOnce(async () => ({ message: { role: "assistant", content: "", toolCalls: [{ id: "activate", name: "load_skill", input: { id: "global:review" } }, { id: "old-effect", name: "write_file", input: { path: "effect.txt", content: "Owned", expectedHash: "new" } }] } }))
			.mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("New model-selected guidance"); expect(() => readFileSync(path.join(root, "effect.txt"))).toThrow(); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "old-effect", isError: true })); return { message: { role: "assistant", content: "", toolCalls: [{ id: "fresh-effect", name: "write_file", input: { path: "effect.txt", content: "Owned", expectedHash: "new" } }] } }; }).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			const approval = vi.fn(async () => "accept" as const);
			await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate }), [], global).run(task, root, "Review and edit", { onDelta: () => {}, onSession: () => {}, onApproval: approval }, account);
			mark("execution");
			expect(approval).toHaveBeenCalledTimes(2); expect(approval.mock.calls[0].slice(0, 2)).toEqual(["Use Phaseo skill review", expect.stringContaining("New model-selected guidance")]); expect(readFileSync(path.join(root, "effect.txt"), "utf8")).toBe("Owned");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); mark("cleanup"); if (performance.now() - started > 1000) console.log("PROJECT_INSTRUCTION_INTEGRATION_TIMING", stages); }
	}, 15000);
	it.each(["code", "plan"] as const)("discovers and loads two model-selected skills with durable recovery in %s", async mode => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-model-skill-adapter-")), global = path.join(root, "instructions"); mkdirSync(global);
		const makeSkill = (name: string, body: string) => { const file = path.join(root, "skills", name, "SKILL.md"); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `---\nname: ${name}\ndescription: ${name} guidance\nuser-invocable: false\n---\n${body}`); return file; };
		const reviewFile = makeSkill("review", "First model skill body"); makeSkill("research", "Second model skill body");
		let store = new WorkspaceStore(path.join(root, "state.sqlite")), runId = "";
		try {
			const generate = vi.fn().mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.tools.map(tool => tool.id)).toContain("list_skills"); if (mode === "plan") expect(request.tools.map(tool => tool.id)).not.toContain("write_file"); expect(request.instructions).not.toContain("First model skill body"); return { message: { role: "assistant", content: "", toolCalls: [{ id: "discover", name: "list_skills", input: {} }] } }; })
			.mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { const catalog = request.messages.find(message => message.role === "tool" && message.toolCallId === "discover"); expect(catalog?.content).toContain("global:review"); expect(catalog?.content).not.toContain("First model skill body"); return { message: { role: "assistant", content: "", toolCalls: [{ id: "first", name: "load_skill", input: { id: "global:review" } }, { id: "second", name: "load_skill", input: { id: "global:research" } }] } }; })
			.mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("First model skill body"); expect(request.instructions).toContain("Second model skill body"); return { message: { role: "assistant", content: "", toolCalls: [{ id: "pause", name: "load_skill", input: { id: "global:review" } }] } }; });
			const adapter = new PhaseoCodingAdapter(() => "unused", store, () => ({ generate }), [], global), approvals: string[] = [];
			await expect(adapter.run({ ...task, mode }, root, "Research", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async (_title, details) => { approvals.push(details); if (approvals.length === 3) await adapter.cancel(); return "accept"; } }, account)).rejects.toThrow("Task stopped");
			expect(approvals[0]).toContain("First model skill body"); expect(approvals[1]).toContain("Second model skill body");
			const saved = store.loadAgentRun(runId); expect(withoutRevision(saved?.run.context)).toEqual({ phaseoModelSkills: expect.arrayContaining([expect.objectContaining({ id: "global:review" }), expect.objectContaining({ id: "global:research" })]) }); expect(JSON.stringify(saved?.run.context)).not.toContain("model skill body");
			store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); writeFileSync(reviewFile, readFileSync(reviewFile, "utf8").replace("First model skill body", "Changed after restart"));
			const currentBody = readFileSync(reviewFile, "utf8"); writeFileSync(reviewFile, currentBody.replace("description:", "enabled: false\ndescription:"));
			const blockedGenerate = vi.fn(); await expect(new PhaseoCodingAdapter(() => "unused", store, () => ({ generate: blockedGenerate }), [], global).run({ ...task, mode, nativeSessionId: runId }, root, "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, account)).rejects.toThrow("could not be restored"); expect(blockedGenerate).not.toHaveBeenCalled(); expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human"); writeFileSync(reviewFile, currentBody);
			const resumed = vi.fn(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Changed after restart"); expect(request.instructions).toContain("Second model skill body"); return { message: { role: "assistant" as const, content: "Finished" } }; }); const reviews: string[] = [];
			await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate: resumed }), [], global).run({ ...task, mode, nativeSessionId: runId }, root, "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: async (_title, details) => { reviews.push(details); return "accept"; } }, account);
			expect(reviews).toHaveLength(3); expect(reviews.slice(0, 2).join("\n")).toContain("Changed after restart"); expect(reviews.slice(0, 2).join("\n")).toContain("Second model skill body"); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("restores skill identity from SQLite, reapproves changed guidance and excludes completed-run skills", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-skill-recovery-")), global = path.join(root, "instructions"), skillFile = path.join(root, "skills", "review", "SKILL.md"); mkdirSync(global); mkdirSync(path.dirname(skillFile), { recursive: true }); const source = (body: string) => `---\nname: review\ndescription: Review changes\n---\n${body}`; writeFileSync(skillFile, source("Initial skill guidance")); let store = new WorkspaceStore(path.join(root, "state.sqlite")), runId = "";
		try {
			const generate = vi.fn(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Initial skill guidance"); return { message: { role: "assistant" as const, content: "", toolCalls: [{ id: "pending-skill-write", name: "write_file", input: { path: "effect.txt", content: "Owned", expectedHash: "new" } }] } }; });
			const first = new PhaseoCodingAdapter(() => "unused", store, () => ({ generate }), [], global);
			await expect(first.run(task, root, "/skill:review target", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async title => { if (title.startsWith("Use Phaseo skill")) return "accept"; await first.cancel(); return "accept"; } }, account, [], { kind: "skill", id: "global:review", name: "review", arguments: "target" })).rejects.toThrow("Task stopped");
			expect(withoutRevision(store.loadAgentRun(runId)?.run.context)).toEqual({ phaseoSkill: { id: "global:review", name: "review" } }); store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); writeFileSync(skillFile, source("Updated skill guidance"));
			const resumedGenerate = vi.fn().mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Updated skill guidance"); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "pending-skill-write", content: expect.stringContaining("Not done: project instructions") })); expect(() => readFileSync(path.join(root, "effect.txt"))).toThrow(); return { message: { role: "assistant", content: "", toolCalls: [{ id: "fresh-skill-write", name: "write_file", input: { path: "effect.txt", content: "Owned", expectedHash: "new" } }] } }; }).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			const approvals: string[] = []; await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate: resumedGenerate }), [], global).run({ ...task, nativeSessionId: runId }, root, "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: async (title, details) => { approvals.push(title); if (title.startsWith("Use Phaseo skill")) expect(details).toContain("Updated skill guidance"); return "accept"; } }, account);
			expect(approvals).toHaveLength(2); expect(readFileSync(path.join(root, "effect.txt"), "utf8")).toBe("Owned"); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
			const freshGenerate = vi.fn(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).not.toContain("Updated skill guidance"); return { message: { role: "assistant" as const, content: "Fresh ordinary run" } }; }); await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate: freshGenerate }), [], global).run({ ...task, nativeSessionId: runId }, root, "New work", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, account);
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("blocks an approved file effect until changed global guidance is reviewed", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-approval-")), global = path.join(root, "instructions"); mkdirSync(global); writeFileSync(path.join(global, "AGENTS.md"), "Initial global guidance"); writeFileSync(path.join(root, "file.txt"), "Before"); const store = new WorkspaceStore(path.join(root, "state.sqlite")); let approvals = 0;
		try {
			const generate = vi.fn().mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Initial global guidance"); return { message: { role: "assistant", content: "", toolCalls: [{ id: "stale", name: "write_file", input: { path: "file.txt", content: "After", expectedHash: contentHash("Before") } }] } }; }).mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Changed global guidance"); expect(readFileSync(path.join(root, "file.txt"), "utf8")).toBe("Before"); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "stale", content: expect.stringContaining("Not done: project instructions") })); return { message: { role: "assistant", content: "", toolCalls: [{ id: "fresh", name: "write_file", input: { path: "file.txt", content: "After", expectedHash: contentHash("Before") } }] } }; }).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate }), [], global).run(task, root, "Edit", { onDelta: () => {}, onSession: () => {}, onApproval: async () => { if (++approvals === 1) writeFileSync(path.join(global, "AGENTS.md"), "Changed global guidance"); return "accept"; } }, account);
			expect(approvals).toBe(2); expect(readFileSync(path.join(root, "file.txt"), "utf8")).toBe("After");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("updates dynamic scopes and blocks a write whose instructions changed during approval", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instruction-run-")); mkdirSync(path.join(root, "src")); writeFileSync(path.join(root, "AGENTS.md"), "Root guidance"); writeFileSync(path.join(root, "src", "AGENTS.md"), "Scoped guidance"); writeFileSync(path.join(root, "src", "file.txt"), "Before");
		const store = new WorkspaceStore(path.join(root, "state.sqlite")); let approvals = 0;
		try {
			const generate = vi.fn().mockImplementationOnce(async (request: AgentModelRequest<unknown>) => {
				expect(request.instructions).toContain("Root guidance"); expect(request.instructions).not.toContain("Scoped guidance");
				return { message: { role: "assistant", content: "", toolCalls: [{ id: "read", name: "read_file", input: { path: "src/file.txt" } }] } };
			}).mockImplementationOnce(async (request: AgentModelRequest<unknown>) => {
				expect(request.instructions).toContain("Scoped guidance"); return { message: { role: "assistant", content: "", toolCalls: [{ id: "stale-write", name: "write_file", input: { path: "src/file.txt", content: "After", expectedHash: contentHash("Before") } }] } };
			}).mockImplementationOnce(async (request: AgentModelRequest<unknown>) => {
				expect(request.instructions).toContain("Changed during approval"); expect(readFileSync(path.join(root, "src", "file.txt"), "utf8")).toBe("Before"); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "stale-write", content: expect.stringContaining("Not done: project instructions") }));
				return { message: { role: "assistant", content: "", toolCalls: [{ id: "fresh-write", name: "write_file", input: { path: "src/file.txt", content: "After", expectedHash: contentHash("Before") } }] } };
			}).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			const activity = vi.fn(); await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate })).run(task, root, "Owned edit", { onDelta: () => {}, onSession: () => {}, onActivity: activity, onApproval: async () => { approvals++; if (approvals === 1) writeFileSync(path.join(root, "AGENTS.md"), "Changed during approval"); return "accept"; } }, account);
			expect(approvals).toBe(2); expect(readFileSync(path.join(root, "src", "file.txt"), "utf8")).toBe("After"); expect(activity).toHaveBeenCalledWith(expect.objectContaining({ title: "Project instructions", text: "Loaded AGENTS.md, src/AGENTS.md" }));
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("reloads changed instructions when a persisted approval resumes in a new adapter", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instruction-resume-")); writeFileSync(path.join(root, "AGENTS.md"), "Before restart");
		let store = new WorkspaceStore(path.join(root, "state.sqlite")); let runId = "";
		try {
			const firstGenerate = vi.fn(async () => ({ message: { role: "assistant" as const, content: "", toolCalls: [{ id: "pending", name: "write_file", input: { path: "new.txt", content: "Owned", expectedHash: "new" } }] } }));
			const first = new PhaseoCodingAdapter(() => "unused", store, () => ({ generate: firstGenerate }));
			await expect(first.run(task, root, "Create owned file", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async () => { await first.cancel(); return "accept"; } }, account)).rejects.toThrow("Task stopped");
			expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human"); store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); writeFileSync(path.join(root, "AGENTS.md"), "After restart");
			const generate = vi.fn().mockImplementationOnce(async (request: AgentModelRequest<unknown>) => {
				expect(request.instructions).toContain("After restart"); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "pending", content: expect.stringContaining("Not done: project instructions") }));
				expect(() => readFileSync(path.join(root, "new.txt"))).toThrow();
				return { message: { role: "assistant", content: "", toolCalls: [{ id: "revised", name: "write_file", input: { path: "new.txt", content: "Owned", expectedHash: "new" } }] } };
			}).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			const approval = vi.fn(async () => "accept" as const);
			await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate })).run({ ...task, nativeSessionId: runId }, root, "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: approval }, account);
			// The stale pending write goes back to the model before anyone is asked; only the fresh write needs approval.
			expect(approval).toHaveBeenCalledTimes(1); expect(readFileSync(path.join(root, "new.txt"), "utf8")).toBe("Owned"); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it.each(["chat", "plan"] as const)("loads root instructions without granting mutation tools in %s", async mode => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instruction-mode-")); writeFileSync(path.join(root, "AGENTS.md"), "Owned project writing style"); const store = new WorkspaceStore(path.join(root, "state.sqlite"));
		try {
			const callbacks = { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" as const };
			if (mode === "chat") {
				const fetcher = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n")); await new PhaseoAdapter(() => "unused", fetcher).run({ ...task, mode }, root, "Write owned text", callbacks, account);
				const body = JSON.parse(fetcher.mock.calls[0][1].body); expect(body.messages[0]).toEqual(expect.objectContaining({ role: "system", content: expect.stringContaining("Owned project writing style") })); expect(body.tools).toBeUndefined();
			} else {
				const generate = vi.fn(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Owned project writing style"); expect(request.tools.map(tool => tool.id)).toEqual(expect.arrayContaining(["update_plan", "read_plan", "ask_user", "read_file", "list_files", "search_files", "find_files"])); expect(request.tools.map(tool => tool.id)).not.toContain("write_file"); return { message: { role: "assistant" as const, content: "Owned plan" } }; });
				await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate })).run({ ...task, mode }, root, "Plan owned work", callbacks, account);
			}
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it.each(["chat", "code"] as const)("rejects invalid root guidance before %s inference", async mode => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instruction-preflight-")); writeFileSync(path.join(root, "AGENTS.md"), Buffer.from([0xff])); const store = new WorkspaceStore(path.join(root, "state.sqlite")), generate = vi.fn(), fetcher = vi.fn();
		try {
			const adapter = mode === "chat" ? new PhaseoAdapter(() => "unused", fetcher) : new PhaseoCodingAdapter(() => "unused", store, () => ({ generate }));
			await expect(adapter.run({ ...task, mode }, root, "Retained input", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, account)).rejects.toThrow("not submitted"); expect(generate).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
});

describe("project instruction prompts and the gate", () => {
	const temporary = () => mkdtempSync(path.join(tmpdir(), "phaseo-instruction-gate-"));
	it("renders Markdown sections with scopes and no revision for the model to echo", async () => {
		const root = temporary(); mkdirSync(path.join(root, "src")); writeFileSync(path.join(root, "AGENTS.md"), "Root rule\n"); writeFileSync(path.join(root, "src", "AGENTS.md"), "Scoped rule");
		try {
			const instructions = new ProjectInstructions(root); await instructions.load("src", true);
			const prompt = instructions.prompt();
			expect(prompt).toContain("### AGENTS.md (applies to the whole project)\nRoot rule"); expect(prompt).toContain("### src/AGENTS.md (applies to src/ and below)\nScoped rule");
			expect(prompt).not.toMatch(/instructionRevision|[a-f0-9]{64}|\{"path"/); expect(instructions.promptedRevision()).toBe(instructions.revision());
			expect(new ProjectInstructions(temporary()).prompt()).toBe("No AGENTS.md instructions apply yet. Instructions in folders you work in load automatically.");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("reads CLAUDE.md when a folder has no AGENTS.md, and truncates oversized files with a warning", async () => {
		const root = temporary(); mkdirSync(path.join(root, "web")); mkdirSync(path.join(root, "api"));
		writeFileSync(path.join(root, "CLAUDE.md"), "Claude root"); writeFileSync(path.join(root, "web", "AGENTS.md"), "Agents web"); writeFileSync(path.join(root, "web", "CLAUDE.md"), "Ignored web"); writeFileSync(path.join(root, "api", "AGENTS.md"), `${"é".repeat(9000)}tail`);
		try {
			const changed = vi.fn(), instructions = new ProjectInstructions(root, changed); await instructions.load("web/page.tsx"); await instructions.load("api", true);
			expect(instructions.list().map(file => file.path)).toEqual(["CLAUDE.md", "api/AGENTS.md", "web/AGENTS.md"]);
			const api = instructions.list()[1];
			expect(Buffer.byteLength(api.text)).toBe(16 * 1024); expect(api.text).toMatch(/^é+$/); expect(api.warning).toBe("api/AGENTS.md is 18 KiB; only the first 16 KiB is loaded.");
			expect(instructions.prompt()).toContain("> Warning: api/AGENTS.md is 18 KiB"); expect(instructions.prompt()).not.toContain("Ignored web");
			expect(changed).toHaveBeenLastCalledWith(["CLAUDE.md", "api/AGENTS.md (truncated)", "web/AGENTS.md"]);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("cuts and omits instructions past the combined budget instead of rejecting input", async () => {
		const root = temporary();
		try {
			const instructions = new ProjectInstructions(root);
			for (let index = 0; index < 34; index++) { mkdirSync(path.join(root, String(index).padStart(2, "0"))); writeFileSync(path.join(root, String(index).padStart(2, "0"), "AGENTS.md"), index < 5 ? "a".repeat(15 * 1024) : "Owned"); await instructions.load(String(index).padStart(2, "0"), true); }
			const files = instructions.list();
			expect(files).toHaveLength(5); expect(files[4].warning).toContain("64 KiB limit"); expect(files.reduce((total, file) => total + Buffer.byteLength(file.text), 0)).toBe(64 * 1024);
			expect(instructions.prompt()).toContain("> Warning: not loaded because the instruction limit (32 files, 64 KiB) was reached: 05/AGENTS.md");
			const deep = Array.from({ length: 32 }, () => "d").join(path.sep); mkdirSync(path.join(root, deep), { recursive: true }); await expect(new ProjectInstructions(root).load(deep, true)).rejects.toThrow("32 directories");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("blocks only paths whose applicable instructions differ from the last prompt", async () => {
		const root = temporary(), global = temporary(); mkdirSync(path.join(root, "src")); mkdirSync(path.join(root, "docs")); writeFileSync(path.join(global, "AGENTS.md"), "Global");
		try {
			const instructions = new ProjectInstructions(root, undefined, global), gate = instructionGate(instructions);
			expect(await instructionGate(undefined)("src/a.ts", "file")).toBeUndefined();
			await instructions.load(".", true);
			expect(await gate("src/a.ts", "file")).toContain("(new: global/AGENTS.md)");
			instructions.prompt(); expect(await gate("src/a.ts", "file")).toBeUndefined();
			writeFileSync(path.join(root, "src", "AGENTS.md"), "Scoped");
			expect(await gate("docs", "directory")).toBeUndefined();
			expect(await gate("src/new/deeper/file.ts", "file")).toBe("Not done: project instructions for `src/new/deeper/file.ts` changed since your last step (new: src/AGENTS.md). They will be in your instructions on the next step. Review them, then retry this action if it still fits.");
			expect(await gate("src", "directory")).toContain("new: src/AGENTS.md");
			expect(await gate(path.join(root, "src", "a.ts"), "file")).toContain("new: src/AGENTS.md"); expect(await gate("./src\\a.ts", "file")).toContain("new: src/AGENTS.md");
			expect(await gate("../elsewhere.ts", "file")).toBeUndefined(); expect(await gate(path.join(global, "x.ts"), "file")).toBeUndefined();
			instructions.prompt(); expect(await gate("src", "directory")).toBeUndefined();
			mkdirSync(path.join(root, "bad")); writeFileSync(path.join(root, "bad", "AGENTS.md"), Buffer.from([0xff]));
			expect(await gate("bad/x.ts", "file")).toContain("could not be loaded (bad/AGENTS.md must contain valid UTF-8 text.)");
			rmSync(path.join(root, "bad"), { recursive: true });
			writeFileSync(path.join(global, "AGENTS.md"), "Global changed"); rmSync(path.join(root, "src", "AGENTS.md"));
			expect(await gate("src/a.ts", "file")).toContain("(changed: global/AGENTS.md; removed: src/AGENTS.md)");
			const saved = instructions.revision(), resumed = new ProjectInstructions(root, undefined, global); await resumed.load(".", true);
			resumed.markPrompted(saved); expect(await instructionGate(resumed)("a.ts", "file")).toBeUndefined();
			resumed.markPrompted("stale-revision"); expect(await instructionGate(resumed)("a.ts", "file")).toContain("new: global/AGENTS.md");
		} finally { rmSync(root, { recursive: true, force: true }); rmSync(global, { recursive: true, force: true }); }
	});
});
