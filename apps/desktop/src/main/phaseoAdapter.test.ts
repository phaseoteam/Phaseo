import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { PhaseoAdapter } from "./phaseoAdapter";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const task: Task = { id: "task", title: "Task", harness: "phaseo", model: "test-model", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.example.test/v1" };
const callbacks = () => ({ onDelta: vi.fn(), onSession: vi.fn(), onApproval: vi.fn() });

describe("Phaseo inference transport", () => {
	it("does not silently discard tool requests before Chat tool execution is connected", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"load","type":"function","function":{"name":"load_skill","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n'));
		await expect(new PhaseoAdapter(() => "owned", fetcher).run(task, ".", "Explain", callbacks(), account)).rejects.toThrow("requested tools");
	});
	it("activates an explicitly approved personal skill as instructions and sends its arguments", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-skill-chat-")), global = path.join(root, "instructions"), skill = path.join(root, "skills", "explain", "SKILL.md"); mkdirSync(global); mkdirSync(path.dirname(skill), { recursive: true }); writeFileSync(skill, "---\nname: explain\ndescription: Explain clearly\n---\nUse concrete examples.");
		try { const fetcher = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n")); const approval = vi.fn().mockResolvedValue("accept"); await new PhaseoAdapter(() => "owned", fetcher, global).run(task, ".", "/skill:explain topic", { ...callbacks(), onApproval: approval }, account, [], { kind: "skill", id: "global:explain", name: "explain", arguments: "topic" }); const messages = JSON.parse(fetcher.mock.calls[0][1].body).messages; expect(messages[0].role).toBe("system"); expect(messages[0].content).toContain("Use concrete examples."); expect(messages[1]).toEqual({ role: "user", content: "topic" }); expect(approval.mock.calls[0][1]).toContain("Use concrete examples."); const declined = vi.fn(); await expect(new PhaseoAdapter(() => "owned", declined, global).run(task, ".", "topic", { ...callbacks(), onApproval: async () => "decline" }, account, [], { kind: "skill", id: "global:explain", name: "explain", arguments: "topic" })).rejects.toThrow("declined"); expect(declined).not.toHaveBeenCalled(); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("applies global guidance in personal Chat and adds scoped project guidance for project Chat", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-chat-")), global = path.join(root, "instructions"), project = path.join(root, "project"); mkdirSync(global); mkdirSync(project); writeFileSync(path.join(global, "AGENTS.md"), "Global style"); writeFileSync(path.join(project, "AGENTS.md"), "Project style");
		try { const fetcher = vi.fn().mockImplementation(async () => new Response("data: [DONE]\n\n")); await new PhaseoAdapter(() => "owned", fetcher, global).run(task, project, "Personal", callbacks(), account); await new PhaseoAdapter(() => "owned", fetcher, global).run({ ...task, projectId: "project" }, project, "Project", callbacks(), account); const personal = JSON.parse(fetcher.mock.calls[0][1].body).messages[0], scoped = JSON.parse(fetcher.mock.calls[1][1].body).messages[0]; expect(personal.role).toBe("system"); expect(personal.content).toContain("Global style"); expect(personal.content).not.toContain("Project style"); expect(scoped.content).toContain("Global style"); expect(scoped.content).toContain("Project style"); expect(scoped.content).toContain("takes precedence"); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("rejects invalid global guidance before submitting personal Chat inference", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-chat-invalid-")); writeFileSync(path.join(root, "AGENTS.md"), "invalid\0guidance");
		try { const fetcher = vi.fn(); await expect(new PhaseoAdapter(() => "owned", fetcher, root).run(task, ".", "Keep input", callbacks(), account)).rejects.toThrow("input was not submitted"); expect(fetcher).not.toHaveBeenCalled(); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("decodes fragmented UTF-8 and SSE frames without exposing credentials in history", async () => {
		const encoder = new TextEncoder(); const bytes = encoder.encode('data: {"choices":[{"delta":{"content":"Hello 🦊"}}]}\r\n\r\ndata: [DONE]\n\n');
		const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
		const fetcher = vi.fn().mockResolvedValue(new Response(body));
		const callback = callbacks(); await new PhaseoAdapter(() => "secret", fetcher).run(task, ".", "Hi", callback, account);
		expect(callback.onDelta).toHaveBeenCalledExactlyOnceWith("assistant", "Hello 🦊");
		expect(fetcher.mock.calls[0][0]).toBe("https://api.example.test/v1/chat/completions");
		expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
		expect(fetcher.mock.calls[0][1].body).not.toContain("secret");
	});
	it("rejects truncated streams and unsupported coding mode", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'));
		await expect(new PhaseoAdapter(() => "secret", fetcher).run(task, ".", "Hi", callbacks(), account)).rejects.toThrow("before completion");
		await expect(new PhaseoAdapter(() => "secret", fetcher).run({ ...task, mode: "code" }, ".", "Hi", callbacks(), account)).rejects.toThrow("Agent SDK adapter");
	});
	it("includes earlier image attachments and documents without duplicating the latest user message", async () => {
		const image = { id: "image", taskId: "task", name: "image.png", kind: "image" as const, mimeType: "image/png", size: 3, filePath: "/image", dataUrl: "data:image/png;base64,YWJj" };
		const document = { id: "document", taskId: "task", name: "notes.txt", kind: "text" as const, mimeType: "text/plain", size: 5, filePath: "/notes", text: "Notes" };
		const fetcher = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
		await new PhaseoAdapter(() => "secret", fetcher).run({ ...task, messages: [{ id: "old", role: "user", text: "What is this?", attachments: [image], createdAt: "" }, { id: "new", role: "user", text: "Compare notes", attachments: [document], createdAt: "" }] }, ".", "Compare notes", callbacks(), account, [image, document]);
		const messages = JSON.parse(fetcher.mock.calls[0][1].body).messages;
		expect(messages).toHaveLength(2); expect(messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: image.dataUrl } }); expect(messages[1].content).toContain("Notes");
	});
});
