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

const task: Task = { id: "task", title: "Owned", projectId: "project", harness: "phaseo", model: "owned", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "Owned", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" };
const revision = (request: AgentModelRequest<unknown>) => request.instructions?.match(/instructionRevision ([a-f0-9]{64})/)?.[1];

describe("Phaseo project instructions in the actual run loop", () => {
	it("blocks an approved file effect until changed global guidance is reviewed", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-approval-")), global = path.join(root, "instructions"); mkdirSync(global); writeFileSync(path.join(global, "AGENTS.md"), "Initial global guidance"); writeFileSync(path.join(root, "file.txt"), "Before"); const store = new WorkspaceStore(path.join(root, "state.sqlite")); let approvals = 0;
		try {
			const generate = vi.fn().mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Initial global guidance"); return { message: { role: "assistant", content: "", toolCalls: [{ id: "stale", name: "write_project_file", input: { path: "file.txt", content: "After", expectedHash: contentHash("Before"), instructionRevision: revision(request) } }] } }; }).mockImplementationOnce(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Changed global guidance"); expect(readFileSync(path.join(root, "file.txt"), "utf8")).toBe("Before"); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "stale", content: expect.stringContaining('"blocked": true') })); return { message: { role: "assistant", content: "", toolCalls: [{ id: "fresh", name: "write_project_file", input: { path: "file.txt", content: "After", expectedHash: contentHash("Before"), instructionRevision: revision(request) } }] } }; }).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
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
				return { message: { role: "assistant", content: "", toolCalls: [{ id: "read", name: "project_files", input: { action: "read", path: "src/file.txt" } }] } };
			}).mockImplementationOnce(async (request: AgentModelRequest<unknown>) => {
				expect(request.instructions).toContain("Scoped guidance"); return { message: { role: "assistant", content: "", toolCalls: [{ id: "stale-write", name: "write_project_file", input: { path: "src/file.txt", content: "After", expectedHash: contentHash("Before"), instructionRevision: revision(request) } }] } };
			}).mockImplementationOnce(async (request: AgentModelRequest<unknown>) => {
				expect(request.instructions).toContain("Changed during approval"); expect(readFileSync(path.join(root, "src", "file.txt"), "utf8")).toBe("Before"); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "stale-write", content: expect.stringContaining('"blocked": true') }));
				return { message: { role: "assistant", content: "", toolCalls: [{ id: "fresh-write", name: "write_project_file", input: { path: "src/file.txt", content: "After", expectedHash: contentHash("Before"), instructionRevision: revision(request) } }] } };
			}).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			const activity = vi.fn(); await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate })).run(task, root, "Owned edit", { onDelta: () => {}, onSession: () => {}, onActivity: activity, onApproval: async () => { approvals++; if (approvals === 1) writeFileSync(path.join(root, "AGENTS.md"), "Changed during approval"); return "accept"; } }, account);
			expect(approvals).toBe(2); expect(readFileSync(path.join(root, "src", "file.txt"), "utf8")).toBe("After"); expect(activity).toHaveBeenCalledWith(expect.objectContaining({ title: "Project instructions", text: "Loaded AGENTS.md, src/AGENTS.md" }));
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("reloads changed instructions when a persisted approval resumes in a new adapter", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instruction-resume-")); writeFileSync(path.join(root, "AGENTS.md"), "Before restart");
		let store = new WorkspaceStore(path.join(root, "state.sqlite")); let runId = "";
		try {
			const firstGenerate = vi.fn(async (request: AgentModelRequest<unknown>) => ({ message: { role: "assistant" as const, content: "", toolCalls: [{ id: "pending", name: "write_project_file", input: { path: "new.txt", content: "Owned", expectedHash: "new", instructionRevision: revision(request) } }] } }));
			const first = new PhaseoCodingAdapter(() => "unused", store, () => ({ generate: firstGenerate }));
			await expect(first.run(task, root, "Create owned file", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async () => { await first.cancel(); return "accept"; } }, account)).rejects.toThrow("Task stopped");
			expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human"); store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); writeFileSync(path.join(root, "AGENTS.md"), "After restart");
			const generate = vi.fn().mockImplementationOnce(async (request: AgentModelRequest<unknown>) => {
				expect(request.instructions).toContain("After restart"); expect(request.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "pending", content: expect.stringContaining('"blocked": true') }));
				expect(() => readFileSync(path.join(root, "new.txt"))).toThrow();
				return { message: { role: "assistant", content: "", toolCalls: [{ id: "revised", name: "write_project_file", input: { path: "new.txt", content: "Owned", expectedHash: "new", instructionRevision: revision(request) } }] } };
			}).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			const approval = vi.fn(async () => "accept" as const);
			await new PhaseoCodingAdapter(() => "unused", store, () => ({ generate })).run({ ...task, nativeSessionId: runId }, root, "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: approval }, account);
			expect(approval).toHaveBeenCalledTimes(2); expect(readFileSync(path.join(root, "new.txt"), "utf8")).toBe("Owned"); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
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
				const generate = vi.fn(async (request: AgentModelRequest<unknown>) => { expect(request.instructions).toContain("Owned project writing style"); expect(request.tools.map(tool => tool.id)).toEqual(["project_files"]); return { message: { role: "assistant" as const, content: "Owned plan" } }; });
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
