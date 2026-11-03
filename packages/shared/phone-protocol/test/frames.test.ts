import { describe, expect, it } from "vitest";
import { effortLabel, parseDesktopFrame, parsePhoneFrame, phoneLimits, PhoneProtocolError, relayHolds, RequestRate } from "../src/index";

const refused = (text: string) => { try { parsePhoneFrame(text); } catch (error) { return error as PhoneProtocolError; } throw new Error("accepted"); };

describe("phone frames", () => {
	it("accepts each request with its fields and drops unknown ones", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "send", chatId: "c", text: "hi", steer: true, extra: 1 }))).toEqual({ id: "1", type: "send", chatId: "c", text: "hi", steer: true });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "list_chats", limit: 50 }))).toEqual({ id: "2", type: "list_chats", limit: 50 });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "subscribe", chatIds: ["a", "a", "b"] }))).toEqual({ id: "3", type: "subscribe", chatIds: ["a", "b"] });
		expect(parsePhoneFrame(JSON.stringify({ id: "4", type: "answer_question", chatId: "c", questionId: "q", answers: { one: ["Yes"] } }))).toMatchObject({ answers: { one: ["Yes"] } });
		expect(parsePhoneFrame(JSON.stringify({ type: "ping" }))).toEqual({ type: "ping" });
	});
	it("refuses what the phone may not ask for, keeping the id for the error", () => {
		expect(refused(JSON.stringify({ id: "1", type: "answer_approval", chatId: "c", approvalId: "a", decision: "always" }))).toMatchObject({ code: "invalid_frame", id: "1", type: "answer_approval" });
		expect(refused(JSON.stringify({ id: "1", type: "list_chats", limit: 51 })).message).toContain("limit");
		expect(refused(JSON.stringify({ id: "1", type: "read_chat" })).message).toContain("chatId");
		expect(refused(JSON.stringify({ id: "1", type: "send", chatId: "c", text: "   " })).message).toContain("text");
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "admin" })).message).toContain("mode");
		expect(refused(JSON.stringify({ id: "1", type: "update_settings" })).message).toBe("Unknown frame type.");
		expect(refused(JSON.stringify({ type: "stop", chatId: "c" })).message).toContain("id");
		expect(refused("not json").code).toBe("invalid_frame");
		expect(refused("[1]").code).toBe("invalid_frame");
	});
	it("lets a new chat name its model and effort, and lists the models to pick from", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "new_chat", text: "Fix it", mode: "code", projectId: "p1", model: "gpt-6.1", reasoningEffort: "high" })))
			.toEqual({ id: "1", type: "new_chat", text: "Fix it", mode: "code", projectId: "p1", model: "gpt-6.1", reasoningEffort: "high" });
		// Without them the computer chooses, as before.
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "new_chat", text: "Fix it", mode: "chat" }))).toEqual({ id: "2", type: "new_chat", text: "Fix it", mode: "chat" });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "list_models", projectId: "p1", extra: true }))).toEqual({ id: "3", type: "list_models", projectId: "p1" });
		expect(parsePhoneFrame(JSON.stringify({ id: "4", type: "list_models" }))).toEqual({ id: "4", type: "list_models" });
	});
	it("lets a new chat name the agent its model belongs to, and asks for a mode's models", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "new_chat", text: "Fix it", mode: "plan", model: "gpt-6.1", harness: "codex", accountId: "acc" })))
			.toEqual({ id: "1", type: "new_chat", text: "Fix it", mode: "plan", model: "gpt-6.1", harness: "codex", accountId: "acc" });
		expect(refused(JSON.stringify({ id: "2", type: "new_chat", text: "x", mode: "code", harness: "codex" })).message).toContain("model");
		expect(refused(JSON.stringify({ id: "3", type: "new_chat", text: "x", mode: "code", model: "m", accountId: "acc" })).message).toContain("harness");
		expect(refused(JSON.stringify({ id: "4", type: "new_chat", text: "x", mode: "code", model: "m", harness: "h".repeat(41) })).message).toContain("harness");
		expect(parsePhoneFrame(JSON.stringify({ id: "5", type: "list_models", mode: "code" }))).toEqual({ id: "5", type: "list_models", mode: "code" });
		expect(refused(JSON.stringify({ id: "6", type: "list_models", mode: "admin" })).message).toContain("mode");
	});
	it("refuses a model, effort or project that isn't an id", () => {
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "code", model: "" })).message).toContain("model");
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "code", reasoningEffort: 3 })).message).toContain("reasoningEffort");
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "code", reasoningEffort: "h".repeat(101) })).message).toContain("reasoningEffort");
		expect(refused(JSON.stringify({ id: "1", type: "list_models", projectId: "a\u0001" }))).toMatchObject({ code: "invalid_frame", id: "1", type: "list_models" });
	});
	it("lists projects, and lets hello carry the phone's protocol", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "list_projects", extra: 1 }))).toEqual({ id: "1", type: "list_projects" });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "hello", deviceId: "d", appVersion: "1", protocol: 2 }))).toEqual({ id: "2", type: "hello", deviceId: "d", appVersion: "1", protocol: 2 });
		// A phone from before protocol 2 sends none.
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "hello", deviceId: "d", appVersion: "1" }))).toEqual({ id: "3", type: "hello", deviceId: "d", appVersion: "1" });
		expect(refused(JSON.stringify({ id: "4", type: "hello", deviceId: "d", appVersion: "1", protocol: "2" })).message).toContain("protocol");
		expect(parseDesktopFrame(JSON.stringify({ type: "projects_changed", projects: [{ id: "p1", name: "Phaseo", repository: true }] }))).toMatchObject({ type: "projects_changed" });
		expect(() => parseDesktopFrame(JSON.stringify({ type: "projects_changed" }))).toThrow(PhoneProtocolError);
	});
	it("organises chats, changes their settings and edits their queue (protocol 3)", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "update_chat", chatId: "c", action: "settle" }))).toEqual({ id: "1", type: "update_chat", chatId: "c", action: "settle" });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "update_chat", chatId: "c", action: "rename", title: "  New name " }))).toMatchObject({ title: "New name" });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "update_chat", chatId: "c", action: "snooze", until: "2026-11-03T09:00:00.000Z" }))).toMatchObject({ until: "2026-11-03T09:00:00.000Z" });
		expect(refused(JSON.stringify({ id: "4", type: "update_chat", chatId: "c", action: "delete" })).message).toContain("action");
		expect(refused(JSON.stringify({ id: "5", type: "update_chat", chatId: "c", action: "rename" })).message).toContain("title");
		expect(refused(JSON.stringify({ id: "6", type: "update_chat", chatId: "c", action: "settle", title: "x" })).message).toContain("title");
		expect(refused(JSON.stringify({ id: "7", type: "update_chat", chatId: "c", action: "snooze", until: "soon" })).message).toContain("until");
		expect(parsePhoneFrame(JSON.stringify({ id: "8", type: "set_chat", chatId: "c", model: "gpt-6.1", reasoningEffort: "high" }))).toEqual({ id: "8", type: "set_chat", chatId: "c", model: "gpt-6.1", reasoningEffort: "high" });
		expect(refused(JSON.stringify({ id: "9", type: "set_chat", chatId: "c" })).message).toContain("set_chat needs");
		expect(parsePhoneFrame(JSON.stringify({ id: "11", type: "set_chat", chatId: "c", defaultEffort: true }))).toEqual({ id: "11", type: "set_chat", chatId: "c", defaultEffort: true });
		expect(refused(JSON.stringify({ id: "12", type: "set_chat", chatId: "c", defaultEffort: true, reasoningEffort: "high" })).message).toContain("not both");
		expect(refused(JSON.stringify({ id: "10", type: "set_chat", chatId: "c", permissionMode: "full-access" })).message).toContain("set_chat needs");
		expect(parsePhoneFrame(JSON.stringify({ id: "11", type: "queue", chatId: "c", messageId: "q1", action: "edit", text: "Shorter" }))).toMatchObject({ action: "edit", text: "Shorter" });
		expect(refused(JSON.stringify({ id: "12", type: "queue", chatId: "c", messageId: "q1", action: "edit" })).message).toContain("text");
		expect(refused(JSON.stringify({ id: "13", type: "queue", chatId: "c", messageId: "q1", action: "remove", text: "x" })).message).toContain("Only edit");
		expect(parsePhoneFrame(JSON.stringify({ id: "14", type: "list_chats", archived: true }))).toEqual({ id: "14", type: "list_chats", archived: true });
	});
	it("reads git status and diffs by chat or project, never by tree id (protocol 4)", () => {
		const hash = "f".repeat(64);
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "git_status", projectId: "p1" }))).toEqual({ id: "1", type: "git_status", projectId: "p1" });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "read_diff", scope: "turn", chatId: "c", messageId: "m", from: "a".repeat(40) }))).toEqual({ id: "2", type: "read_diff", scope: "turn", chatId: "c", messageId: "m" });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "read_diff", scope: "branch", projectId: "p1", baseRef: "origin/main" }))).toEqual({ id: "3", type: "read_diff", scope: "branch", projectId: "p1", baseRef: "origin/main" });
		expect(parsePhoneFrame(JSON.stringify({ id: "4", type: "read_diff_file", scope: "uncommitted", chatId: "c", path: "src/a b.ts", hash }))).toEqual({ id: "4", type: "read_diff_file", scope: "uncommitted", chatId: "c", path: "src/a b.ts", hash });
		expect(refused(JSON.stringify({ id: "5", type: "git_status" })).message).toContain("projectId");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff", scope: "commit", projectId: "p1" })).message).toContain("scope");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff", scope: "uncommitted" })).message).toContain("chatId or a projectId");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff", scope: "uncommitted", chatId: "c", projectId: "p1" })).message).toContain("not both");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff", scope: "turn", projectId: "p1" })).message).toContain("chatId");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff", scope: "uncommitted", chatId: "c", messageId: "m" })).message).toContain("messageId");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff", scope: "turn", chatId: "c", baseRef: "main" })).message).toContain("baseRef");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff_file", scope: "uncommitted", chatId: "c", path: "a", hash: "nope" })).message).toContain("hash");
		expect(refused(JSON.stringify({ id: "5", type: "read_diff_file", scope: "uncommitted", chatId: "c", path: "a b", hash })).message).toContain("path");
		// The phone keeps only capabilities it knows.
		expect(parseDesktopFrame(JSON.stringify({ type: "access", capabilities: ["code", "root"] }))).toEqual({ type: "access", capabilities: ["code"] });
	});
	it("lists and reads files by chat or project, refusing paths that climb out (protocol 5)", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "list_files", chatId: "c", directory: "" }))).toEqual({ id: "1", type: "list_files", chatId: "c", directory: "" });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "list_files", projectId: "p1", query: "usage" }))).toEqual({ id: "2", type: "list_files", projectId: "p1", query: "usage" });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "read_file", projectId: "p1", path: "src/a b.ts" }))).toEqual({ id: "3", type: "read_file", projectId: "p1", path: "src/a b.ts" });
		for (const path of ["../secret", "src/../../x", "/etc/passwd", "C:/Windows/win.ini", "src\\..\\x", "./a", "src/", ""]) {
			expect(refused(JSON.stringify({ id: "4", type: "read_file", projectId: "p1", path })).message).toContain("path");
		}
		expect(refused(JSON.stringify({ id: "5", type: "list_files", projectId: "p1", directory: ".." })).message).toContain("directory");
		expect(refused(JSON.stringify({ id: "5", type: "list_files", projectId: "p1" })).message).toContain("directory or a query");
		expect(refused(JSON.stringify({ id: "5", type: "list_files", projectId: "p1", directory: "", query: "a" })).message).toContain("directory or a query");
		expect(refused(JSON.stringify({ id: "5", type: "list_files", projectId: "p1", query: " " })).message).toContain("query");
		expect(refused(JSON.stringify({ id: "5", type: "read_file", path: "a.ts" })).message).toContain("chatId or a projectId");
		expect(refused(JSON.stringify({ id: "5", type: "read_file", chatId: "c", projectId: "p1", path: "a.ts" })).message).toContain("not both");
		// Never held for an offline computer: a read is only worth anything now.
		expect(relayHolds({ type: "read_file" })).toBe(false);
		expect(relayHolds({ type: "list_files" })).toBe(false);
	});
	it("checks git actions field by field, and never holds them for an offline computer (protocol 6)", () => {
		const parse = (value: object) => parsePhoneFrame(JSON.stringify({ id: "1", projectId: "p1", ...value }));
		expect(parse({ type: "git_action", action: "commit", message: "Fix usage", all: true })).toEqual({ id: "1", type: "git_action", projectId: "p1", action: "commit", message: "Fix usage", all: true });
		expect(parse({ type: "git_action", action: "switch-branch", name: "fix/login" })).toEqual({ id: "1", type: "git_action", projectId: "p1", action: "switch-branch", name: "fix/login" });
		expect(parse({ type: "git_action", action: "stage", filename: "src/a.ts" })).toMatchObject({ filename: "src/a.ts" });
		expect(parse({ type: "git_status", pullRequest: true })).toEqual({ id: "1", type: "git_status", projectId: "p1", pullRequest: true });
		expect(refused(JSON.stringify({ id: "1", type: "git_action", projectId: "p1", action: "reset" })).message).toContain("action must be one of");
		expect(refused(JSON.stringify({ id: "1", type: "git_action", projectId: "p1", action: "commit", message: " " })).message).toContain("message");
		expect(refused(JSON.stringify({ id: "1", type: "git_action", projectId: "p1", action: "push", message: "x" })).message).toContain("push doesn't take message");
		for (const name of ["-f", "a b", "a..b", "a~1", "@{u}", ""]) expect(refused(JSON.stringify({ id: "1", type: "git_action", projectId: "p1", action: "create-branch", name })).message).toContain("branch name");
		expect(refused(JSON.stringify({ id: "1", type: "git_action", projectId: "p1", action: "stage", filename: "../x" })).message).toContain("filename");
		// A worktree from a base branch, only in a project.
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "new_chat", text: "hi", mode: "code", projectId: "p1", workspace: { kind: "worktree", base: "origin/main" } }))).toMatchObject({ workspace: { kind: "worktree", base: "origin/main" } });
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "hi", mode: "code", workspace: { kind: "worktree", base: "main" } })).message).toContain("projectId");
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "hi", mode: "code", projectId: "p1", workspace: { kind: "worktree", base: "--orphan" } })).message).toContain("worktree");
		// A command replayed hours later would surprise the person, and the phone has long stopped waiting for its answer.
		for (const type of ["git_action", "commit_message", "create_pull_request", "pr_action", "list_branches", "list_pull_requests", "read_pull_request", "pull_request_files"]) expect(relayHolds({ type })).toBe(false);
	});
	it("checks pull request frames, allowing only merge, close, reopen, comment and review (protocol 6)", () => {
		const head = "a".repeat(40);
		const action = (value: object) => JSON.stringify({ id: "1", type: "pr_action", projectId: "p1", number: 7, headOid: head, action: value });
		expect(parsePhoneFrame(action({ type: "merge", method: "squash" }))).toEqual({ id: "1", type: "pr_action", projectId: "p1", number: 7, headOid: head, action: { type: "merge", method: "squash" } });
		expect(parsePhoneFrame(action({ type: "review", event: "approve" }))).toMatchObject({ action: { type: "review", event: "approve", body: "" } });
		expect(refused(action({ type: "review", event: "request-changes", body: " " })).message).toContain("review");
		expect(refused(action({ type: "merge", method: "fast-forward" })).message).toContain("method");
		expect(refused(action({ type: "delete-branch" })).message).toContain("action must be");
		expect(refused(action({ type: "comment", body: "" })).message).toContain("comment");
		expect(refused(JSON.stringify({ id: "1", type: "pr_action", projectId: "p1", number: 7, headOid: "abc", action: { type: "close" } })).message).toContain("headOid");
		expect(refused(JSON.stringify({ id: "1", type: "read_pull_request", projectId: "p1", number: 0 })).message).toContain("number");
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "pull_request_files", projectId: "p1", number: 7, headOid: head, baseOid: "b".repeat(40), page: 2 }))).toMatchObject({ page: 2 });
		expect(refused(JSON.stringify({ id: "1", type: "pull_request_files", projectId: "p1", number: 7, headOid: head, baseOid: "b".repeat(40), page: 31 })).message).toContain("page");
	});
	it("names efforts the same way on both sides", () => {
		expect(effortLabel("xhigh")).toBe("Extra high");
		expect(effortLabel("medium")).toBe("Medium");
		expect(effortLabel("turbo")).toBe("Turbo");
	});
	it("refuses frames over 1 MiB", () => {
		expect(refused(JSON.stringify({ id: "1", type: "send", chatId: "c", text: "x".repeat(phoneLimits.frameBytes) })).code).toBe("too_large");
	});
	it("checks the shape of the desktop's frames for the phone", () => {
		expect(parseDesktopFrame(JSON.stringify({ id: "1", type: "stop", ok: true, result: { chatId: "c" } }))).toMatchObject({ ok: true });
		expect(parseDesktopFrame(JSON.stringify({ type: "attention", chatId: "c", kind: "done", summary: "Finished" }))).toMatchObject({ kind: "done" });
		expect(() => parseDesktopFrame(JSON.stringify({ type: "attention", chatId: "c", kind: "other", summary: "" }))).toThrow(PhoneProtocolError);
		expect(() => parseDesktopFrame(JSON.stringify({ id: "1", ok: false }))).toThrow(PhoneProtocolError);
	});
});

describe("request rate", () => {
	it("allows a burst of 50 a second, then refuses until time passes", () => {
		let now = 0; const rate = new RequestRate(() => now);
		expect(Array.from({ length: 50 }, () => rate.take()).every(Boolean)).toBe(true);
		expect(rate.take()).toBe(false);
		now += 100;
		expect(Array.from({ length: 5 }, () => rate.take()).every(Boolean)).toBe(true);
		expect(rate.take()).toBe(false);
	});
});
