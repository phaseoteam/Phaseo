import { describe, expect, it } from "vitest";
import { fakeModels, fakePhoneHost } from "./fakePhoneHost";
import { phoneModels, phoneNewChat, withPhoneModel, type DiscoverModels } from "./phoneHost";

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

describe("the model a phone picks for a new chat", () => {
	const codexApp = () => {
		const app = fakePhoneHost();
		app.overview().projects[0]!.settings = { defaultModel: { harness: "codex", model: "gpt-6.1", reasoningEffort: "low", serviceTier: "fast" } };
		return app;
	};
	const discover = async (harness: Parameters<DiscoverModels>[0]) => fakeModels[harness] ?? [];

	it("lists the default agent's models with their efforts, without legacy ones, and what it would use", async () => {
		const app = codexApp();
		expect(await phoneModels(app.overview(), discover, { projectId: "p1" })).toEqual({
			models: [
				{ id: "gpt-6.1", name: "GPT-6.1", efforts: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "xhigh", label: "Extra high" }], defaultEffort: "medium" },
				{ id: "gpt-6.1-mini", name: "GPT-6.1 mini" },
			],
			selected: { model: "gpt-6.1", reasoningEffort: "low" },
		});
	});
	it("reads a Reasoning option as the effort for harnesses that describe their own settings", async () => {
		const app = fakePhoneHost();
		app.addTask({ id: "latest", harness: "claude", model: "claude-opus-5-5" });
		const { models } = await phoneModels(app.overview(), discover, {});
		expect(models).toEqual([{ id: "claude-opus-5-5", name: "Claude Opus 5.5", efforts: [{ id: "low", label: "Low" }, { id: "high", label: "High" }], defaultEffort: "high" }]);
	});
	it("still names the default model when the harness can't be asked", async () => {
		const app = codexApp();
		expect(await phoneModels(app.overview(), async () => { throw new Error("offline"); }, { projectId: "p1" })).toEqual({ models: [{ id: "gpt-6.1", name: "gpt-6.1" }], selected: { model: "gpt-6.1", reasoningEffort: "low" } });
	});
	it("applies the model and effort, dropping the default model's own settings", async () => {
		const base = phoneNewChat(codexApp().overview(), { projectId: "p1", mode: "code" });
		expect(await withPhoneModel(base, discover, { model: "gpt-6.1-mini" })).toEqual({ type: "create-task", harness: "codex", model: "gpt-6.1-mini", mode: "code", projectId: "p1" });
		expect(await withPhoneModel(base, discover, { reasoningEffort: "xhigh" })).toMatchObject({ model: "gpt-6.1", reasoningEffort: "xhigh", serviceTier: "fast" });
		expect(await withPhoneModel(base, discover, {})).toBe(base);
	});
	it("puts an option harness's effort in its model options", async () => {
		const app = fakePhoneHost();
		app.addTask({ id: "latest", harness: "claude", model: "claude-opus-5-5" });
		const base = phoneNewChat(app.overview(), { mode: "code" });
		expect(await withPhoneModel(base, discover, { reasoningEffort: "low" })).toMatchObject({ harness: "claude", model: "claude-opus-5-5", modelOptions: { effort: "low" } });
	});
	it("refuses a model or effort the harness doesn't offer", async () => {
		const base = phoneNewChat(codexApp().overview(), { projectId: "p1", mode: "code" });
		await expect(withPhoneModel(base, discover, { model: "gpt-9" })).rejects.toThrow("isn't available");
		await expect(withPhoneModel(base, discover, { model: "gpt-6.1-mini", reasoningEffort: "high" })).rejects.toThrow("doesn't offer that effort");
		await expect(withPhoneModel(base, discover, { reasoningEffort: "ultra" })).rejects.toThrow("doesn't offer that effort");
	});
});
