import { describe, expect, it } from "vitest";
import { fakePhoneHost } from "./fakePhoneHost";
import { phoneNewChat } from "./phoneHost";

describe("chats started from a phone", () => {
	it("use the project's default model and permissions", () => {
		const app = fakePhoneHost();
		const overview = app.overview();
		overview.projects[0]!.settings = { defaultModel: { harness: "codex", model: "gpt-6.1", reasoningEffort: "high", serviceTier: "fast" }, defaultPermissionMode: "accept-edits" };
		expect(phoneNewChat(overview, { projectId: "p1", mode: "code" })).toEqual({ type: "create-task", harness: "codex", model: "gpt-6.1", mode: "code", projectId: "p1", permissionMode: "accept-edits", reasoningEffort: "high", serviceTier: "fast" });
	});
	it("otherwise use the latest chat's model, preferring the same project", () => {
		const app = fakePhoneHost();
		app.addTask({ id: "in-project", harness: "claude", model: "claude-opus-5-5", projectId: "p1", accountId: "acct" });
		app.addTask({ id: "elsewhere", harness: "phaseo", model: "phaseo/fast" });
		expect(phoneNewChat(app.overview(), { projectId: "p1", mode: "code" })).toEqual({ type: "create-task", harness: "claude", model: "claude-opus-5-5", mode: "code", projectId: "p1", accountId: "acct" });
		expect(phoneNewChat(app.overview(), { mode: "chat" })).toMatchObject({ harness: "phaseo", model: "phaseo/fast", mode: "chat" });
	});
	it("refuse rather than guess when there's nothing to go on", () => {
		expect(() => phoneNewChat(fakePhoneHost().overview(), { mode: "chat" })).toThrow("Start a chat on the computer first");
	});
});
