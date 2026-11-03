import { describe, expect, it } from "vitest";
import { cachedConnectedHarnesses, localConnectedHarnesses } from "../connectedHarnesses";
import { fakePhoneHost } from "./fakePhoneHost";
import { phoneModels, phoneNewChat, withPhoneModel } from "./phoneHost";

const codexEfforts = [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "xhigh", label: "Extra high" }];

describe("the models a phone can start a chat with", () => {
	it("lists every agent the window's picker would, each with its models, legacy ones marked", async () => {
		const app = fakePhoneHost();
		const result = await phoneModels(app.overview(), app.sources, { mode: "code" });
		expect(result.agents?.map(agent => [agent.harness, agent.name, agent.source, agent.models.length])).toEqual([["phaseo", "Phaseo", "phaseo", 2], ["codex", "Codex", "local", 3], ["claude", "Claude Code", "local", 1]]);
		expect(result.agents?.[0]).toMatchObject({ accountId: "phaseo-account", models: [{ id: "phaseo/test" }, { id: "anthropic/claude-sonnet-5", releaseDate: "2026-09-01", organisationId: "anthropic", fast: true }] });
		expect(result.agents?.[1]?.models).toEqual([
			{ id: "gpt-6.1", name: "GPT-6.1", efforts: codexEfforts, defaultEffort: "medium" },
			{ id: "gpt-6.1-mini", name: "GPT-6.1 mini" },
			{ id: "gpt-5", name: "GPT-5", legacy: true },
		]);
		expect(result.agents?.[2]?.models).toEqual([{ id: "claude-opus-5-5", name: "Claude Opus 5.5", efforts: [{ id: "low", label: "Low" }, { id: "high", label: "High" }], defaultEffort: "high" }]);
	});
	it("gives an agent that can't be read its error instead of failing the list", async () => {
		const app = fakePhoneHost();
		app.agents.failing.add("claude");
		const result = await phoneModels(app.overview(), app.sources, { mode: "chat" });
		expect(result.agents?.find(agent => agent.harness === "claude")).toEqual({ harness: "claude", name: "Claude Code", source: "local", models: [], error: "Not signed in on the computer." });
	});
	it("offers Grok only in Code and Plan, and leaves out the agents a project turns off", async () => {
		const app = fakePhoneHost();
		app.agents.local = ["codex", "claude", "grok"];
		app.projects[0]!.settings = { disabledHarnesses: ["claude"] };
		const harnesses = async (input: Parameters<typeof phoneModels>[2]) => (await phoneModels(app.overview(), app.sources, input)).agents?.map(agent => agent.harness);
		expect(await harnesses({ mode: "chat" })).toEqual(["phaseo", "codex", "claude"]);
		expect(await harnesses({ mode: "code" })).toEqual(["phaseo", "codex", "claude", "grok"]);
		expect(await harnesses({ mode: "plan", projectId: "p1" })).toEqual(["phaseo", "codex", "grok"]);
	});
	it("leaves Phaseo out without a usable account", async () => {
		const app = fakePhoneHost();
		app.accounts[0]!.oauthExpiresAt = "2020-01-01T00:00:00.000Z";
		expect((await phoneModels(app.overview(), app.sources, { mode: "code" })).agents?.map(agent => agent.harness)).toEqual(["codex", "claude"]);
	});
	it("passes on the window's favourites", async () => {
		const app = fakePhoneHost();
		app.agents.remembered = { favourites: ["codex:gpt-6.1"] };
		expect((await phoneModels(app.overview(), app.sources, { mode: "chat" })).favourites).toEqual(["codex:gpt-6.1"]);
	});
});

describe("what a phone's new chat starts with unasked", () => {
	it("is the project's default model in a project", async () => {
		const app = fakePhoneHost();
		app.projects[0]!.settings = { defaultModel: { harness: "codex", model: "gpt-6.1", reasoningEffort: "low", serviceTier: "fast" }, defaultPermissionMode: "accept-edits" };
		app.agents.remembered = { selection: { harness: "claude", model: "claude-opus-5-5" }, favourites: [] };
		const result = await phoneModels(app.overview(), app.sources, { projectId: "p1", mode: "code" });
		expect(result).toMatchObject({ selected: { harness: "codex", model: "gpt-6.1", reasoningEffort: "low" }, permissionMode: "accept-edits" });
		// Phones from before agents read the selected agent's models.
		expect(result.models.map(model => model.id)).toEqual(["gpt-6.1", "gpt-6.1-mini", "gpt-5"]);
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", projectId: "p1", mode: "code" }))
			.toEqual({ type: "create-task", harness: "codex", model: "gpt-6.1", mode: "code", projectId: "p1", permissionMode: "accept-edits", reasoningEffort: "low", serviceTier: "fast" });
	});
	it("is the remembered model otherwise, and in a plain chat even in a project", async () => {
		const app = fakePhoneHost();
		app.projects[0]!.settings = { defaultModel: { harness: "codex", model: "gpt-6.1" } };
		app.agents.remembered = { selection: { harness: "claude", model: "claude-opus-5-5", options: { effort: "low" } }, favourites: [] };
		expect((await phoneModels(app.overview(), app.sources, { projectId: "p1", mode: "chat" })).selected).toEqual({ harness: "claude", model: "claude-opus-5-5", reasoningEffort: "low" });
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", mode: "chat" })).toEqual({ type: "create-task", harness: "claude", model: "claude-opus-5-5", mode: "chat", modelOptions: { effort: "low" } });
	});
	it("is the Phaseo account's default model when nothing is remembered", async () => {
		const app = fakePhoneHost();
		expect((await phoneModels(app.overview(), app.sources, { mode: "chat" })).selected).toEqual({ harness: "phaseo", accountId: "phaseo-account", model: "anthropic/claude-sonnet-5" });
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", mode: "plan" })).toMatchObject({ harness: "phaseo", accountId: "phaseo-account", model: "anthropic/claude-sonnet-5", mode: "plan" });
	});
	it("skips a remembered or project model whose agent can't run now", async () => {
		const app = fakePhoneHost();
		app.projects[0]!.settings = { defaultModel: { harness: "pi", model: "pi-model" } };
		app.agents.remembered = { selection: { harness: "cursor", model: "auto-x" }, favourites: [] };
		expect((await phoneModels(app.overview(), app.sources, { projectId: "p1", mode: "code" })).selected).toMatchObject({ harness: "phaseo", model: "anthropic/claude-sonnet-5" });
	});
	it("with nothing to go on, opens the picker on the first model listed but won't start a chat unasked", async () => {
		const app = fakePhoneHost();
		app.accounts.length = 0;
		expect((await phoneModels(app.overview(), app.sources, { mode: "chat" })).selected).toEqual({ harness: "codex", model: "gpt-6.1", reasoningEffort: undefined });
		await expect(phoneNewChat(app.overview(), app.sources, { text: "x", mode: "chat" })).rejects.toThrow("Pick a model in a chat on the computer first");
		app.agents.local = [];
		await expect(phoneModels(app.overview(), app.sources, { mode: "chat" })).rejects.toThrow("Pick a model in a chat on the computer first");
	});
	it("runs with the latest chat's permissions when the project sets none, preferring the project's chats", async () => {
		const app = fakePhoneHost();
		app.addTask({ id: "in-project", projectId: "p1", permissionMode: "accept-edits" });
		app.addTask({ id: "elsewhere", permissionMode: "full-access" });
		expect((await phoneModels(app.overview(), app.sources, { projectId: "p1", mode: "code" })).permissionMode).toBe("accept-edits");
		expect((await phoneModels(app.overview(), app.sources, { mode: "chat" })).permissionMode).toBe("full-access");
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", mode: "chat" })).toMatchObject({ permissionMode: "full-access" });
	});
});

describe("a model the phone picks", () => {
	it("starts on the agent it belongs to, keeping a local agent's remembered sign-in", async () => {
		const app = fakePhoneHost();
		app.agents.remembered = { selection: { harness: "claude", model: "claude-opus-5-5", accountId: "claude-work" }, favourites: [] };
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", mode: "code", harness: "codex", model: "gpt-6.1-mini" })).toEqual({ type: "create-task", harness: "codex", model: "gpt-6.1-mini", mode: "code" });
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", mode: "code", harness: "claude", model: "claude-opus-5-5" })).toMatchObject({ harness: "claude", accountId: "claude-work" });
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", mode: "chat", harness: "phaseo", model: "phaseo/test" })).toMatchObject({ harness: "phaseo", accountId: "phaseo-account" });
	});
	it("keeps the default model's own settings when the phone picks that model", async () => {
		const app = fakePhoneHost();
		app.projects[0]!.settings = { defaultModel: { harness: "codex", model: "gpt-6.1", reasoningEffort: "low", serviceTier: "fast" } };
		const base = await phoneNewChat(app.overview(), app.sources, { text: "x", projectId: "p1", mode: "code", harness: "codex", model: "gpt-6.1" });
		expect(base).toEqual({ type: "create-task", harness: "codex", model: "gpt-6.1", mode: "code", projectId: "p1", reasoningEffort: "low", serviceTier: "fast" });
		expect(await withPhoneModel(base, app.sources.discover, { model: "gpt-6.1", reasoningEffort: "xhigh" })).toMatchObject({ reasoningEffort: "xhigh", serviceTier: "fast" });
	});
	it("refuses an agent that isn't listed", async () => {
		const app = fakePhoneHost();
		await expect(phoneNewChat(app.overview(), app.sources, { text: "x", mode: "code", harness: "pi", model: "m" })).rejects.toThrow("isn't available");
		await expect(phoneNewChat(app.overview(), app.sources, { text: "x", mode: "chat", harness: "grok", model: "grok-5-code" })).rejects.toThrow("isn't available");
		await expect(phoneNewChat(app.overview(), app.sources, { text: "x", mode: "chat", harness: "phaseo", accountId: "other", model: "phaseo/test" })).rejects.toThrow("isn't available");
	});
	it("applies the model and effort, dropping the default model's own settings", async () => {
		const app = fakePhoneHost();
		app.projects[0]!.settings = { defaultModel: { harness: "codex", model: "gpt-6.1", reasoningEffort: "low", serviceTier: "fast" } };
		const base = await phoneNewChat(app.overview(), app.sources, { text: "x", projectId: "p1", mode: "code" });
		expect(await withPhoneModel(base, app.sources.discover, { model: "gpt-6.1-mini" })).toEqual({ type: "create-task", harness: "codex", model: "gpt-6.1-mini", mode: "code", projectId: "p1" });
		expect(await withPhoneModel(base, app.sources.discover, { reasoningEffort: "xhigh" })).toMatchObject({ model: "gpt-6.1", reasoningEffort: "xhigh", serviceTier: "fast" });
		expect(await withPhoneModel(base, app.sources.discover, {})).toBe(base);
		await expect(withPhoneModel(base, app.sources.discover, { model: "gpt-9" })).rejects.toThrow("isn't available");
		await expect(withPhoneModel(base, app.sources.discover, { model: "gpt-6.1-mini", reasoningEffort: "high" })).rejects.toThrow("doesn't offer that effort");
	});
	it("lists and starts a project's own models, read in that project", async () => {
		const app = fakePhoneHost();
		app.agents.projectModels = { p1: { codex: [{ id: "project-model", name: "Project model" }], phaseo: [{ id: "phaseo/project", name: "Project default", default: true }] } };
		const listed = await phoneModels(app.overview(), app.sources, { projectId: "p1", mode: "code" });
		expect(listed.agents?.find(agent => agent.harness === "codex")?.models.map(model => model.id)).toEqual(["project-model"]);
		expect(listed.selected).toMatchObject({ harness: "phaseo", model: "phaseo/project" });
		expect(await phoneNewChat(app.overview(), app.sources, { text: "x", projectId: "p1", mode: "code" })).toMatchObject({ harness: "phaseo", model: "phaseo/project" });
		const base = await phoneNewChat(app.overview(), app.sources, { text: "x", projectId: "p1", mode: "code", harness: "codex", model: "project-model" });
		expect(await withPhoneModel(base, app.sources.discover, { model: "project-model" })).toMatchObject({ harness: "codex", model: "project-model", projectId: "p1" });
	});
	it("puts an option harness's effort in its model options", async () => {
		const app = fakePhoneHost();
		const base = await phoneNewChat(app.overview(), app.sources, { text: "x", mode: "code", harness: "claude", model: "claude-opus-5-5" });
		expect(await withPhoneModel(base, app.sources.discover, { model: "claude-opus-5-5", reasoningEffort: "low" })).toMatchObject({ harness: "claude", model: "claude-opus-5-5", modelOptions: { effort: "low" } });
	});
});

describe("connected local agents", () => {
	const probe = (calls: string[]) => ({
		installations: async () => [{ harness: "codex" as const, installed: true }, { harness: "claude" as const, installed: true }, { harness: "pi" as const, installed: true }, { harness: "grok" as const, installed: false }],
		authenticated: async (harness: "codex" | "claude" | "grok") => { calls.push(harness); if (harness === "claude") throw new Error("timed out"); return true; },
		models: async () => { calls.push("pi"); return []; },
	});
	it("are installed and signed in, or list models; a failed check counts as not connected", async () => {
		expect(await localConnectedHarnesses(probe([]))).toEqual(["codex"]);
	});
	it("are checked at most once a minute, shared by the window and phones", async () => {
		const calls: string[] = [];
		let now = 0;
		const connected = cachedConnectedHarnesses(probe(calls), 60_000, () => now);
		await Promise.all([connected(), connected()]);
		now = 59_000; await connected();
		expect(calls.sort()).toEqual(["claude", "codex", "pi"]);
		now = 61_000; await connected();
		expect(calls).toHaveLength(6);
		await connected(true);
		expect(calls).toHaveLength(9);
	});
});
