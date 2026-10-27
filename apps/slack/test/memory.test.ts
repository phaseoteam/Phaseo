import { beforeEach, describe, expect, it } from "vitest";
import { expiryFrom, loadTurnMemory, memoryInstructions, MEMORY_TOOL_IDS, memoryPromptLines, memoryTools, noteAccess, SKILL_TOOL_IDS, type NoteAccess } from "../src/memory";
import { FakeDb, INSTALLATION_ID } from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const CHANNEL = "C0CHANNEL1";
const PERSON = "U0PERSON01";
const NOTE_ID = "00000000-0000-4000-8000-0000000000e1";

let db: FakeDb;
let notes: string[];
/** Whether the answer has searched Slack, as searchedThisAnswer says. */
let searchedSlack: boolean;

function tools(access: NoteAccess = "workspace") {
	return memoryTools({ db, installationId: INSTALLATION_ID, channel: CHANNEL, slackUserId: PERSON, now: () => NOW, notes, access, searched: async () => searchedSlack });
}

function tool(id: string, access: NoteAccess = "workspace") {
	const found = tools(access).find((entry) => entry.id === id);
	if (!found || typeof found.execute !== "function") throw new Error(`no tool ${id}`);
	return (input: Record<string, unknown>) => (found.execute as (input: unknown, context: unknown) => Promise<any>)(input, {});
}

function noteRow(overrides: Record<string, unknown> = {}) {
	return {
		id: NOTE_ID, kind: "note", channel_id: CHANNEL, text: "Deploys freeze on Fridays.", done_at: null, created_by: PERSON,
		created_at: "2026-10-20T09:00:00Z", updated_at: "2026-10-20T09:00:00Z", expires_at: null, ...overrides,
	};
}

beforeEach(() => {
	db = new FakeDb();
	notes = [];
	searchedSlack = false;
});

describe("memory tools", () => {
	it("are offered in a fixed order; with memory off, only the skill tools", () => {
		expect(tools("workspace").map((entry) => entry.id)).toEqual([...MEMORY_TOOL_IDS]);
		expect(tools("conversation").map((entry) => entry.id)).toEqual([...MEMORY_TOOL_IDS]);
		expect(tools("off").map((entry) => entry.id)).toEqual([...SKILL_TOOL_IDS]);
	});

	it("note access: off with memory off, the conversation's for someone from another organisation, else the workspace's too", () => {
		expect(noteAccess({ memory_enabled: true }, {})).toBe("workspace");
		expect(noteAccess({ memory_enabled: true }, { external: true })).toBe("conversation");
		expect(noteAccess({ memory_enabled: false }, { external: true })).toBe("off");
		expect(noteAccess({ memory_enabled: false }, {})).toBe("off");
	});

	it("remember saves for this conversation by default, or the whole workspace, and never says what it saved in working memory", async () => {
		db.rpcResults.save_slack_agent_note = { status: "saved", note: noteRow() };
		await expect(tool("remember")({ text: "  Deploys freeze on Fridays.  " })).resolves.toEqual({
			saved: true, already_saved: false, id: NOTE_ID, kind: "note", scope: "this conversation", text: "Deploys freeze on Fridays.",
			saved_by: `<@${PERSON}>`, saved_on: "2026-10-20",
		});
		expect(db.rpcs.at(-1)).toEqual({ fn: "save_slack_agent_note", args: {
			p_installation_id: INSTALLATION_ID, p_kind: "note", p_channel_id: CHANNEL, p_text: "Deploys freeze on Fridays.", p_created_by: PERSON, p_expires_at: null,
		} });
		db.rpcResults.save_slack_agent_note = { status: "exists", note: noteRow({ kind: "pin", channel_id: null, expires_at: "2026-11-01T00:00:00Z" }) };
		await expect(tool("remember")({ text: "Deploys freeze on Fridays.", kind: "pin", scope: "workspace", expires_on: "2026-10-31" })).resolves.toMatchObject({
			saved: true, already_saved: true, scope: "whole workspace", kept_until: "2026-10-31",
		});
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_kind: "pin", p_channel_id: null, p_expires_at: "2026-11-01T00:00:00.000Z" });
		expect(notes).toEqual(["remember note (conversation)", "remember pin (workspace)"]);
		expect(notes.join(" ")).not.toContain("Fridays");
	});

	it("remember explains a full memory and an uninstalled agent, and refuses bad input before the database", async () => {
		db.rpcResults.save_slack_agent_note = { status: "full", limit: 500 };
		await expect(tool("remember")({ text: "One more" })).resolves.toMatchObject({ saved: false, note: expect.stringContaining("full (500 notes)") });
		db.rpcResults.save_slack_agent_note = { status: "not_installed" };
		await expect(tool("remember")({ text: "One more" })).resolves.toMatchObject({ saved: false, note: expect.stringContaining("no longer installed") });
		// An admin turned memory off after the turn started.
		db.rpcResults.save_slack_agent_note = { status: "memory_off" };
		await expect(tool("remember")({ text: "One more" })).resolves.toMatchObject({ saved: false, note: expect.stringContaining("turned your memory off") });
		const calls = db.rpcs.length;
		await expect(tool("remember")({ text: "x".repeat(501) })).rejects.toThrow("at most 500 characters");
		await expect(tool("remember")({ text: "   " })).rejects.toThrow("text is required");
		await expect(tool("remember")({ text: "x", kind: "reminder" })).rejects.toThrow("kind must be one of note, pin, todo");
		await expect(tool("remember")({ text: "x", scope: "everyone" })).rejects.toThrow("scope must be conversation or workspace");
		await expect(tool("remember")({ text: "x", expires_on: "2026-10-20" })).rejects.toThrow("today or later");
		await expect(tool("remember")({ text: "x", expires_on: "next week" })).rejects.toThrow("a date like");
		expect(db.rpcs).toHaveLength(calls);
	});

	it("expiries are the end of a UTC day, from today up to two years out", () => {
		expect(expiryFrom(undefined, NOW)).toBeNull();
		expect(expiryFrom("2026-10-21", NOW)).toBe("2026-10-22T00:00:00.000Z");
		expect(() => expiryFrom("2026-02-30", NOW)).toThrow("a date like");
		expect(() => expiryFrom("2028-12-31", NOW)).toThrow("within two years");
	});

	it("recall searches this conversation and the workspace, and reports to-dos as done or not", async () => {
		db.rpcResults.search_slack_agent_notes = [noteRow({ kind: "todo", done_at: "2026-10-21T08:00:00Z" })];
		await expect(tool("recall")({ query: " budget  Q4 ", kind: "todo", include_done: true, limit: 5 })).resolves.toEqual({
			notes: [{ id: NOTE_ID, kind: "todo", scope: "this conversation", text: "Deploys freeze on Fridays.", done: true, saved_by: `<@${PERSON}>`, saved_on: "2026-10-20" }],
		});
		expect(db.rpcs.at(-1)).toEqual({ fn: "search_slack_agent_notes", args: {
			p_installation_id: INSTALLATION_ID, p_channel_id: CHANNEL, p_workspace_notes: true, p_query: "budget  Q4", p_kind: "todo", p_include_done: true, p_limit: 5,
		} });
		db.rpcResults.search_slack_agent_notes = null;
		await expect(tool("recall")({})).resolves.toEqual({ notes: [] });
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_query: null, p_kind: null, p_include_done: false, p_limit: 10 });
		await expect(tool("recall")({ limit: 50 })).rejects.toThrow("from 1 to 20");
		await expect(tool("recall")({ include_done: "yes" })).rejects.toThrow("include_done must be true or false");
		expect(notes).toEqual(["recall budget Q4", "recall"]);
	});

	it("update_todo and forget take a note id, and say when there was nothing to change", async () => {
		db.rpcResults.set_slack_agent_todo_done = [noteRow({ kind: "todo", done_at: "2026-10-21T12:00:00Z" })];
		await expect(tool("update_todo")({ id: NOTE_ID.toUpperCase(), done: true })).resolves.toMatchObject({ updated: true, done: true });
		expect(db.rpcs.at(-1)).toEqual({ fn: "set_slack_agent_todo_done", args: { p_installation_id: INSTALLATION_ID, p_channel_id: CHANNEL, p_workspace_notes: true, p_note_id: NOTE_ID, p_done: true } });
		db.rpcResults.set_slack_agent_todo_done = [];
		await expect(tool("update_todo")({ id: NOTE_ID, done: false })).resolves.toMatchObject({ updated: false });
		await expect(tool("update_todo")({ id: "the budget one", done: true })).rejects.toThrow("id must be a note id");
		await expect(tool("update_todo")({ id: NOTE_ID, done: "yes" })).rejects.toThrow("done must be true or false");

		db.rpcResults.forget_slack_agent_note = true;
		await expect(tool("forget")({ id: NOTE_ID })).resolves.toEqual({ deleted: true });
		expect(db.rpcs.at(-1)).toEqual({ fn: "forget_slack_agent_note", args: { p_installation_id: INSTALLATION_ID, p_channel_id: CHANNEL, p_workspace_notes: true, p_note_id: NOTE_ID } });
		db.rpcResults.forget_slack_agent_note = false;
		await expect(tool("forget")({ id: NOTE_ID })).resolves.toMatchObject({ deleted: false });
	});

	it("someone from another organisation reads and saves only this conversation's notes", async () => {
		const remember = tools("conversation").find((entry) => entry.id === "remember")!;
		expect((remember.parameters as any).properties.scope.enum).toEqual(["conversation"]);
		expect(tools("conversation").find((entry) => entry.id === "recall")!.description).not.toContain("workspace");
		const calls = db.rpcs.length;
		await expect(tool("remember", "conversation")({ text: "x", scope: "workspace" })).rejects.toThrow("from another organisation");
		expect(db.rpcs).toHaveLength(calls);

		db.rpcResults.save_slack_agent_note = { status: "saved", note: noteRow() };
		await expect(tool("remember", "conversation")({ text: "Deploys freeze on Fridays." })).resolves.toMatchObject({ saved: true, scope: "this conversation" });
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_channel_id: CHANNEL });
		db.rpcResults.search_slack_agent_notes = [];
		await tool("recall", "conversation")({});
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_channel_id: CHANNEL, p_workspace_notes: false });
		db.rpcResults.set_slack_agent_todo_done = [];
		await expect(tool("update_todo", "conversation")({ id: NOTE_ID, done: true })).resolves.toEqual({ updated: false, note: "No to-do with that id in this conversation." });
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_workspace_notes: false });
		db.rpcResults.forget_slack_agent_note = false;
		await expect(tool("forget", "conversation")({ id: NOTE_ID })).resolves.toEqual({ deleted: false, note: "No note with that id in this conversation." });
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_workspace_notes: false });
	});

	it("save_skill saves, replaces only when asked, and explains a taken name or a full list", async () => {
		db.rpcResults.save_slack_agent_skill = { status: "saved", skill: { name: "Weekly report", description: "Summarise the week." } };
		await expect(tool("save_skill")({ name: " Weekly\nreport ", description: "Summarise\n the week.", instructions: "  List what shipped.\nThen what slipped.  " })).resolves.toEqual({ saved: true, replaced: false, name: "Weekly report" });
		expect(db.rpcs.at(-1)).toEqual({ fn: "save_slack_agent_skill", args: {
			p_installation_id: INSTALLATION_ID, p_name: "Weekly report", p_description: "Summarise the week.", p_instructions: "List what shipped.\nThen what slipped.", p_created_by: PERSON, p_replace: false,
		} });
		db.rpcResults.save_slack_agent_skill = { status: "replaced", skill: { name: "Weekly report", description: "x" } };
		await expect(tool("save_skill")({ name: "Weekly report", description: "x", instructions: "y", replace: true })).resolves.toEqual({ saved: true, replaced: true, name: "Weekly report" });
		expect(db.rpcs.at(-1)?.args.p_replace).toBe(true);
		db.rpcResults.save_slack_agent_skill = { status: "name_taken", skill: { name: "Weekly report", description: "x" } };
		await expect(tool("save_skill")({ name: "weekly report", description: "x", instructions: "y" })).resolves.toMatchObject({ saved: false, note: expect.stringContaining("already exists") });
		db.rpcResults.save_slack_agent_skill = { status: "full", limit: 100 };
		await expect(tool("save_skill")({ name: "Another", description: "x", instructions: "y" })).resolves.toMatchObject({ saved: false, note: expect.stringContaining("100 saved skills") });
		await expect(tool("save_skill")({ name: "x".repeat(61), description: "x", instructions: "y" })).rejects.toThrow("at most 60 characters");
		await expect(tool("save_skill")({ name: "x", description: "x", instructions: "y".repeat(4_001) })).rejects.toThrow("at most 4000 characters");
		expect(notes).toEqual(["save_skill Weekly report", "save_skill Weekly report", "save_skill weekly report", "save_skill Another"]);
	});

	it("save nothing once the answer has searched Slack, and say why; reading and tidying still work", async () => {
		searchedSlack = true;
		db.rpcResults.save_slack_agent_note = { status: "saved", note: noteRow() };
		db.rpcResults.save_slack_agent_skill = { status: "saved", skill: { name: "Launch notes", description: "x" } };
		const refused = { saved: false, note: expect.stringContaining("Slack's terms don't allow keeping anything its search finds") };
		await expect(tool("remember")({ text: "The launch ships on Friday." })).resolves.toEqual(refused);
		await expect(tool("remember")({ text: "Check the launch", kind: "todo", scope: "workspace" })).resolves.toEqual(refused);
		await expect(tool("save_skill")({ name: "Launch notes", description: "x", instructions: "Ship on Friday." })).resolves.toEqual(refused);
		expect(db.rpcs.map((call) => call.fn)).toEqual([]);
		expect(notes).toEqual([]);
		// Nothing they keep comes from the search.
		db.rpcResults.search_slack_agent_notes = [noteRow()];
		await expect(tool("recall")({})).resolves.toMatchObject({ notes: [expect.objectContaining({ id: NOTE_ID })] });
		db.rpcResults.forget_slack_agent_note = true;
		await expect(tool("forget")({ id: NOTE_ID })).resolves.toEqual({ deleted: true });
	});

	it("list_skills reads names and descriptions for the installation; use_skill loads one by name", async () => {
		db.tables.slack_agent_skills = [
			{ installation_id: INSTALLATION_ID, name: "Weekly report", description: "Summarise the week.", instructions: "secret steps" },
			{ installation_id: "00000000-0000-4000-8000-0000000000ff", name: "Elsewhere", description: "Not ours.", instructions: "x" },
		];
		await expect(tool("list_skills")({})).resolves.toEqual({ skills: [{ name: "Weekly report", description: "Summarise the week." }] });
		expect(db.queries.at(-1)).toEqual({ table: "slack_agent_skills", query: { select: "name,description", installation_id: `eq.${INSTALLATION_ID}`, order: "name.asc", limit: "100" } });

		db.rpcResults.get_slack_agent_skill = [{ id: NOTE_ID, name: "Weekly report", description: "Summarise the week.", instructions: "List what shipped.", created_by: PERSON, updated_at: "2026-10-20T09:00:00Z" }];
		await expect(tool("use_skill")({ name: "weekly report" })).resolves.toEqual({ found: true, name: "Weekly report", description: "Summarise the week.", instructions: "List what shipped." });
		expect(db.rpcs.at(-1)).toEqual({ fn: "get_slack_agent_skill", args: { p_installation_id: INSTALLATION_ID, p_name: "weekly report" } });
		db.rpcResults.get_slack_agent_skill = [];
		await expect(tool("use_skill")({ name: "Nope" })).resolves.toMatchObject({ found: false });
		expect(notes).toEqual(["list_skills", "use_skill Weekly report", "use_skill Nope"]);
	});
});

describe("memory in the prompt", () => {
	it("lists this conversation's pins, then the workspace's, then the skills, and points to the rest", async () => {
		db.rpcResults.load_slack_agent_turn_memory = {
			pins: [
				{ id: "p1", scope: "channel", text: "Release notes go out\non Tuesdays.", created_at: "2026-10-20T09:00:00Z" },
				{ id: "p2", scope: "workspace", text: "Our fiscal year starts on 1 April.", created_at: "2026-10-19T09:00:00Z" },
			],
			skills: [{ name: "Weekly report", description: "Summarise the week." }],
			skills_total: "3",
		};
		const memory = await loadTurnMemory(db, INSTALLATION_ID, CHANNEL, "workspace");
		expect(db.rpcs.at(-1)).toEqual({ fn: "load_slack_agent_turn_memory", args: { p_installation_id: INSTALLATION_ID, p_channel_id: CHANNEL, p_workspace_notes: true } });
		expect(memoryPromptLines(memory)).toEqual([
			"Pinned in this conversation, newest first:",
			"- Release notes go out on Tuesdays. (id p1)",
			"",
			"Pinned for the whole Slack workspace, newest first:",
			"- Our fiscal year starts on 1 April. (id p2)",
			"",
			"Saved skills (call use_skill to load one):",
			"- Weekly report: Summarise the week.",
			"(and 2 more: call list_skills to see them all)",
			"",
		]);
	});

	it("shows someone from another organisation only this conversation's pins, and no pins with memory off", async () => {
		// What the database returns is checked again here.
		db.rpcResults.load_slack_agent_turn_memory = {
			pins: [
				{ id: "p1", scope: "channel", text: "Release notes go out on Tuesdays.", created_at: "2026-10-20T09:00:00Z" },
				{ id: "p2", scope: "workspace", text: "Our fiscal year starts on 1 April.", created_at: "2026-10-19T09:00:00Z" },
			],
			skills: [{ name: "Weekly report", description: "Summarise the week." }],
			skills_total: 1,
		};
		const external = memoryPromptLines(await loadTurnMemory(db, INSTALLATION_ID, CHANNEL, "conversation"));
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_workspace_notes: false });
		expect(external).toContain("- Release notes go out on Tuesdays. (id p1)");
		expect(external.join(" ")).not.toContain("fiscal year");
		const off = memoryPromptLines(await loadTurnMemory(db, INSTALLATION_ID, CHANNEL, "off"));
		expect(db.rpcs.at(-1)?.args).toMatchObject({ p_workspace_notes: false });
		expect(off).toEqual(["Saved skills (call use_skill to load one):", "- Weekly report: Summarise the week.", ""]);
	});

	it("tells the agent what it can keep: the workspace's notes, only the conversation's, or none", () => {
		const [workspace, workspaceSkills] = memoryInstructions("workspace");
		expect(workspace).toContain("Keep it to this conversation unless they ask for the whole workspace.");
		const [conversation, conversationSkills] = memoryInstructions("conversation");
		expect(conversation).toContain("from another organisation, so you can only see and save this conversation's notes");
		const [off, offSkills] = memoryInstructions("off");
		expect(off).toContain("turned your memory (notes, pins and to-dos) off");
		expect(off).not.toContain("remember only when");
		expect(new Set([workspaceSkills, conversationSkills, offSkills]).size).toBe(1);
		expect(offSkills).toContain("use_skill");
	});

	it("adds nothing when there is nothing to show or the database can't say", async () => {
		db.rpcResults.load_slack_agent_turn_memory = { pins: [], skills: [], skills_total: 0 };
		expect(memoryPromptLines(await loadTurnMemory(db, INSTALLATION_ID, CHANNEL, "workspace"))).toEqual([]);
		db.failingRpcs.add("load_slack_agent_turn_memory");
		await expect(loadTurnMemory(db, INSTALLATION_ID, CHANNEL, "workspace")).resolves.toBeNull();
		expect(memoryPromptLines(null)).toEqual([]);
	});
});
