import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { PhaseoAdapter } from "./phaseoAdapter";

const task: Task = { id: "task", title: "Task", harness: "phaseo", model: "test-model", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.example.test/v1" };
const callbacks = () => ({ onDelta: vi.fn(), onSession: vi.fn(), onApproval: vi.fn() });

describe("Phaseo inference transport", () => {
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
