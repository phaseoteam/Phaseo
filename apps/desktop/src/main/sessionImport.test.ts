import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listNativeSessions, MAX_IMPORTED_MESSAGES, parseSession } from "./sessionImport";
import { handoffPrompt } from "./handoffPrompt";
import { WorkspaceStore } from "./workspaceStore";

const lines = (...values: object[]) => values.map(value => JSON.stringify(value)).join("\n");
const at = "2026-10-30T10:00:00.000Z";

describe("reading Claude Code transcripts", () => {
	it("keeps the person's requests and the agent's replies, and leaves out tool traffic, side chains and meta records", () => {
		const parsed = parseSession("claude", lines(
			{ type: "user", sessionId: "c1", cwd: "E:\\web", timestamp: at, message: { role: "user", content: "Fix the login page\nIt 500s" } },
			{ type: "assistant", sessionId: "c1", timestamp: at, message: { role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: "Looking." }, { type: "tool_use", name: "Read", input: {} }] } },
			{ type: "user", sessionId: "c1", timestamp: at, message: { role: "user", content: [{ type: "tool_result", content: "file contents" }] } },
			{ type: "user", sessionId: "c1", isMeta: true, message: { role: "user", content: "<command-name>/clear</command-name>" } },
			{ type: "assistant", sessionId: "c1", isSidechain: true, message: { role: "assistant", content: "subagent" } },
			{ type: "assistant", sessionId: "c1", message: { role: "assistant", model: "<synthetic>", content: "Fixed it." } },
			{ type: "summary", summary: "x" },
			"not json" as unknown as object,
		), at);
		expect(parsed).toMatchObject({ sessionId: "c1", cwd: "E:\\web", model: "claude-opus-5", title: "Fix the login page" });
		expect(parsed!.messages.map(message => [message.role, message.text])).toEqual([["user", "Fix the login page\nIt 500s"], ["assistant", "Looking."], ["assistant", "Fixed it."]]);
	});

	it("names the conversation by its rename, else Claude's own title, and needs a session and a request", () => {
		expect(parseSession("claude", lines({ type: "user", sessionId: "c2", message: { content: "Hi" } }, { aiTitle: "Greeting" }, { customTitle: "Renamed" }), at)?.title).toBe("Renamed");
		expect(parseSession("claude", lines({ type: "user", sessionId: "c2", message: { content: "Hi" } }, { aiTitle: "Greeting" }), at)?.title).toBe("Greeting");
		expect(parseSession("claude", lines({ type: "assistant", sessionId: "c3", message: { content: "Alone" } }), at)).toBeUndefined();
		expect(parseSession("claude", lines({ type: "user", message: { content: "No session" } }), at)).toBeUndefined();
	});

	it("keeps the first request and the newest messages of a long conversation", () => {
		const many = Array.from({ length: MAX_IMPORTED_MESSAGES + 50 }, (_, index) => ({ type: index % 2 ? "assistant" : "user", sessionId: "c4", message: { content: `Message ${index}` } }));
		const parsed = parseSession("claude", lines(...many), at)!;
		expect(parsed.messages).toHaveLength(MAX_IMPORTED_MESSAGES);
		expect(parsed.messages[0].text).toBe("Message 0");
		expect(parsed.messages.at(-1)!.text).toBe(`Message ${MAX_IMPORTED_MESSAGES + 49}`);
	});
});

describe("reading Codex transcripts", () => {
	it("takes requests from user_message events, replies from assistant messages, and skips the setup context", () => {
		const parsed = parseSession("codex", lines(
			{ timestamp: at, type: "session_meta", payload: { id: "019a-thread", cwd: "/repo" } },
			{ type: "turn_context", payload: { model: "gpt-6-codex", cwd: "/repo" } },
			{ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>cwd</environment_context>" }] } },
			{ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Add tests" }] } },
			{ type: "event_msg", payload: { type: "user_message", message: "Add tests" } },
			{ type: "response_item", payload: { type: "function_call", name: "shell" } },
			{ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Added three tests." }] } },
		), at);
		expect(parsed).toMatchObject({ sessionId: "019a-thread", cwd: "/repo", model: "gpt-6-codex", title: "Add tests" });
		expect(parsed!.messages.map(message => [message.role, message.text])).toEqual([["user", "Add tests"], ["assistant", "Added three tests."]]);
	});

	it("falls back to the response copies, without setup context, when there are no user_message events", () => {
		const parsed = parseSession("codex", lines(
			{ type: "session_meta", payload: { id: "old" } },
			{ timestamp: "2026-10-30T10:00:01Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<user_instructions>be brief</user_instructions>\nRename the module" }] } },
			{ timestamp: "2026-10-30T10:00:02Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Renamed." }] } },
		), at);
		expect(parsed!.messages.map(message => message.text)).toEqual(["Rename the module", "Renamed."]);
		expect(parsed!.title).toBe("Rename the module");
	});
});

describe("listing and importing past conversations", () => {
	it("lists recent sessions newest first, marks ones a chat already has, and leaves compressed ones out", async () => {
		const home = mkdtempSync(path.join(tmpdir(), "phaseo-sessions-"));
		try {
			mkdirSync(path.join(home, "claude", "projects", "web"), { recursive: true });
			mkdirSync(path.join(home, "codex", "sessions", "2026", "10", "30"), { recursive: true });
			writeFileSync(path.join(home, "claude", "projects", "web", "c1.jsonl"), lines({ type: "user", sessionId: "c1", cwd: home, message: { content: "Fix it" } }));
			writeFileSync(path.join(home, "codex", "sessions", "2026", "10", "30", "rollout.jsonl"), lines({ type: "session_meta", payload: { id: "x1" } }, { type: "event_msg", payload: { type: "user_message", message: "Ship it" } }));
			writeFileSync(path.join(home, "codex", "sessions", "2026", "10", "30", "old.jsonl.zst"), "compressed");
			const sessions = await listNativeSessions([{ harness: "claude", directory: path.join(home, "claude"), accountId: "work" }, { harness: "codex", directory: path.join(home, "codex") }], new Set(["codex:x1"]));
			expect(sessions.map(session => [session.harness, session.sessionId, session.title, session.imported, session.accountId])).toEqual(expect.arrayContaining([["claude", "c1", "Fix it", false, "work"], ["codex", "x1", "Ship it", true, undefined]]));
			expect(sessions).toHaveLength(2);
		} finally { rmSync(home, { recursive: true, force: true }); }
	});

	it("stores an imported chat with its native session, so continuing resumes it instead of pasting the history", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-session-import-")), store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		try {
			const project = store.addProject(directory);
			const task = store.importTask({ type: "create-task", harness: "claude", model: "default", mode: "code", projectId: project.id }, { title: "Fix it", createdAt: at, nativeSessionId: "c1", messages: [{ id: "m1", role: "user", text: "Fix it", createdAt: at }] }, []);
			const stored = store.getTask(task.id);
			expect(stored).toMatchObject({ nativeSessionId: "c1", title: "Fix it" });
			expect(stored.handoffFrom).toBeUndefined();
			expect(store.sessionOwners().has("claude:c1")).toBe(true);
			expect(handoffPrompt({ ...stored, messages: [...stored.messages, { id: "m2", role: "user", text: "Carry on", createdAt: at }] }, "Carry on")).toBe("Carry on");
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
