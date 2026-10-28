import { afterEach, describe, expect, it, vi } from "vitest";
import { ORIGINAL_BOT_SCOPES } from "../src/installations";
import {
	actionTokenOf,
	MAX_SEARCHES_PER_ANSWER,
	savingRefusal,
	searchArgs,
	searchAvailability,
	searchedThisAnswer,
	searchErrorText,
	searchInstructions,
	searchResults,
	searchSlackTool,
	searchTokenFor,
} from "../src/slack-search";
import { FakeSlack } from "./fakes";

const TOKEN = "7310092.18.0c9f5a6d2e8bTOKEN";
const SCOPES = [...ORIGINAL_BOT_SCOPES, "search:read.public"];
const DM = { channel: "D0DIRECT01", kind: "dm" as const };
const CHANNEL = { channel: "C0CHANNEL1", kind: "mention" as const };
const MEMBER = { isExternal: false, isGuest: false };

/** Two messages and a file, as Slack's search answers. */
const RESPONSE = {
	results: {
		messages: [
			{
				author_name: "Ada Lovelace", author_user_id: "U0ADA00001", team_id: "T0TEST0001", channel_id: "C0LAUNCH01", channel_name: "launch",
				message_ts: "1792500000.000100", content: "We ship  the launch\n plan on Friday.", is_author_bot: false,
				permalink: "https://acme.slack.com/archives/C0LAUNCH01/p1792500000000100",
			},
			{ author_user_id: "U0BOB00001", channel_id: "C0LAUNCH01", message_ts: "1792500300.000200", content: "x".repeat(400), permalink: "https://evil.example.com/archives/C0LAUNCH01" },
			"not a message",
		],
		files: [{ title: "Launch checklist", file_type: "pdf", author_name: "Ada Lovelace", author_user_id: "U0ADA00001", date_created: 1_792_400_000, permalink: "https://acme.slack.com/files/U0ADA00001/F0FILE0001/checklist.pdf" }],
	},
	response_metadata: { next_cursor: "dXNlcjpVMEc5V0ZYTlo=" },
};

/** The tool, with the answer's searches counted here as the coordinator would (reserveSearch). */
function makeTool(slack: FakeSlack, options: { files: boolean; notes: string[]; questionAsked?: () => boolean }) {
	const counted = { searches: 0 };
	const tool = searchSlackTool({
		slack: slack.client("xoxb-test"), actionToken: TOKEN, files: options.files, notes: options.notes, turnId: 7,
		reserve: async () => counted.searches < MAX_SEARCHES_PER_ANSWER && (counted.searches += 1) > 0,
		questionAsked: options.questionAsked ?? (() => false),
	});
	return { tool, counted };
}

function execute(tool: ReturnType<typeof searchSlackTool>, input: unknown) {
	if (typeof tool.execute !== "function") throw new Error("search_slack has no execute");
	return tool.execute(input,{ runId: "run", agentId: "agent", stepIndex: 0, context: undefined, toolCall: { id: "call", name: tool.id, input }, emitProgress: () => undefined, setContext: () => undefined } as never);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Slack search: when it's offered", () => {
	it("needs the search scope, admins' permission for the conversation, and someone from this organisation", () => {
		expect(searchAvailability({ search_mode: "dm", bot_scopes: SCOPES }, DM)).toBe("on");
		expect(searchAvailability({ search_mode: "dm", bot_scopes: null }, DM)).toBe("needs_permissions");
		expect(searchAvailability({ search_mode: "off", bot_scopes: SCOPES }, DM)).toBe("off");
		expect(searchAvailability({ search_mode: "dm", bot_scopes: SCOPES }, CHANNEL)).toBe("dm_only");
		expect(searchAvailability({ search_mode: "dm_and_channels", bot_scopes: SCOPES }, CHANNEL)).toBe("on");
		expect(searchAvailability({ search_mode: "dm_and_channels", bot_scopes: SCOPES }, { ...CHANNEL, external: true })).toBe("external");
		// A mention in a direct message with the agent is still a direct message.
		expect(searchAvailability({ search_mode: "dm", bot_scopes: SCOPES }, { channel: "D0DIRECT01", kind: "mention" })).toBe("on");
		// A scheduled run of a recurring task answers no one's message: never, whatever else allows it.
		const schedule = { id: "00000000-0000-4000-8000-00000000e5c1", runAt: "2026-10-27T09:00:00+00:00" };
		expect(searchAvailability({ search_mode: "dm_and_channels", bot_scopes: SCOPES }, { ...DM, schedule })).toBe("scheduled");
		expect(searchAvailability({ search_mode: "off", bot_scopes: null }, { ...CHANNEL, schedule })).toBe("scheduled");
	});

	it("reads Slack's action token from the event, or from assistant_thread, and keeps it only where it may be used", () => {
		expect(actionTokenOf({ action_token: TOKEN })).toBe(TOKEN);
		expect(actionTokenOf({ assistant_thread: { action_token: TOKEN } })).toBe(TOKEN);
		for (const bad of ["", "short", "has a space in it", 42, null, `x${"y".repeat(1_000)}`]) expect(actionTokenOf({ action_token: bad })).toBeNull();
		const installation = { search_mode: "dm" as const, bot_scopes: SCOPES };
		expect(searchTokenFor(installation, DM, MEMBER, { action_token: TOKEN })).toBe(TOKEN);
		expect(searchTokenFor(installation, DM, { ...MEMBER, isGuest: true }, { action_token: TOKEN })).toBeNull();
		expect(searchTokenFor(installation, DM, { ...MEMBER, isExternal: true }, { action_token: TOKEN })).toBeNull();
		expect(searchTokenFor(installation, CHANNEL, MEMBER, { action_token: TOKEN })).toBeNull();
		expect(searchTokenFor({ ...installation, bot_scopes: null }, DM, MEMBER, { action_token: TOKEN })).toBeNull();
	});
});

describe("Slack search: the request", () => {
	it("sends the query with Slack's filters, the action token, public channels only, and inclusive UTC days", () => {
		expect(searchArgs({ query: "  launch\nplan ", channel: "<#C0LAUNCH01|launch>", person: "U0ADA00001", from: "2026-10-01", to: "2026-10-07", sort: "newest" }, { actionToken: TOKEN, files: true })).toEqual({
			query: "launch plan in:<#C0LAUNCH01> from:<@U0ADA00001>",
			action_token: TOKEN,
			channel_types: "public_channel",
			content_types: "messages,files",
			include_bots: false,
			limit: 10,
			sort: "timestamp",
			sort_dir: "desc",
			after: Date.UTC(2026, 9, 1) / 1000 - 1,
			before: Date.UTC(2026, 9, 8) / 1000,
		});
		expect(searchArgs({ query: "what did we decide about pricing?" }, { actionToken: TOKEN, files: false })).toMatchObject({ query: "what did we decide about pricing?", content_types: "messages", sort: "score" });
	});

	it("tells the model what to fix in its input", () => {
		const args = (input: Record<string, unknown>) => () => searchArgs(input, { actionToken: TOKEN, files: false });
		expect(args({})).toThrow("query is required");
		expect(args({ query: "x".repeat(301) })).toThrow("at most 300 characters");
		expect(args({ query: "a", channel: "general" })).toThrow("channel must be a Slack channel ID");
		expect(args({ query: "a", channel: "D0DIRECT01" })).toThrow("channel must be a Slack channel ID");
		expect(args({ query: "a", person: "@ada" })).toThrow("person must be a Slack user ID");
		expect(args({ query: "a", from: "2026-10-08", to: "2026-10-01" })).toThrow("from must be on or before to");
		expect(args({ query: "a", from: "2026-02-30" })).toThrow("from must be a date");
		expect(args({ query: "a", sort: "oldest" })).toThrow("sort must be relevance or newest");
	});
});

describe("Slack search: the results", () => {
	it("are short, with Slack links only, and say when there are more", () => {
		expect(searchResults(RESPONSE)).toEqual({
			messages: [
				{ channel: "<#C0LAUNCH01|launch>", author: "Ada Lovelace (<@U0ADA00001>)", date: "2026-10-20 12:40 UTC", link: "https://acme.slack.com/archives/C0LAUNCH01/p1792500000000100", text: "We ship the launch plan on Friday." },
				{ channel: "<#C0LAUNCH01>", author: "<@U0BOB00001>", date: "2026-10-20 12:45 UTC", link: null, text: `${"x".repeat(299)}…` },
			],
			files: [{ title: "Launch checklist", type: "pdf", author: "Ada Lovelace (<@U0ADA00001>)", date: "2026-10-19 08:53 UTC", link: "https://acme.slack.com/files/U0ADA00001/F0FILE0001/checklist.pdf", text: null }],
			more: true,
		});
		expect(searchResults({})).toEqual({ messages: [], files: [], more: false });
	});

	it("passes on Slack's refusals in words the model can use, never the error", () => {
		expect(searchErrorText("ratelimited")).toContain("limiting how often");
		expect(searchErrorText("invalid_action_token")).toContain("ask again in a new message");
		expect(searchErrorText("missing_scope")).toContain("update the Phaseo agent's Slack permissions");
		expect(searchErrorText("feature_not_enabled")).toContain("only for apps from its app directory and a company's own apps");
		expect(searchErrorText("something_new")).toBe("Slack search didn't work just now. Answer with what you have, and say so.");
	});
});

describe("search_slack", () => {
	it("searches as the person, and keeps only the query and the count as a note, never a result or the token in logs", async () => {
		const slack = new FakeSlack();
		slack.searchResponse = RESPONSE;
		const notes: string[] = [];
		const logs = [vi.spyOn(console, "log").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined)];
		const { tool } = makeTool(slack, { files: true, notes });
		const result = await execute(tool, { query: "launch plan" });
		expect(result).toMatchObject({ found: true, messages: [expect.objectContaining({ text: "We ship the launch plan on Friday." }), expect.anything()], files: [expect.objectContaining({ title: "Launch checklist" })], note: expect.stringContaining("more matches") });
		expect(slack.of("assistant.search.context")).toEqual([{ token: "xoxb-test", method: "assistant.search.context", args: expect.objectContaining({ query: "launch plan", action_token: TOKEN, channel_types: "public_channel" }) }]);
		expect(notes).toEqual(["search_slack \"launch plan\": 3 results"]);
		const logged = JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
		for (const secret of [TOKEN, "launch plan", "We ship", "Launch checklist"]) expect(logged).not.toContain(secret);
	});

	it("says when nothing was found, passes on refusals, and stops once the answer has made its searches", async () => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const slack = new FakeSlack();
		const notes: string[] = [];
		const { tool, counted } = makeTool(slack, { files: false, notes });
		await expect(execute(tool, { query: "nothing here" })).resolves.toMatchObject({ found: false, messages: [], note: expect.stringContaining("Nothing found") });
		slack.failures.set("assistant.search.context", ["invalid_action_token"]);
		await expect(execute(tool, { query: "again" })).resolves.toEqual({ found: false, error: searchErrorText("invalid_action_token") });
		// Input mistakes don't use up a search.
		await expect(execute(tool, { query: "" })).rejects.toThrow("query is required");
		expect(counted.searches).toBe(2);
		for (let index = 2; index < MAX_SEARCHES_PER_ANSWER; index += 1) await execute(tool, { query: `try ${index}` });
		await expect(execute(tool, { query: "one more" })).resolves.toMatchObject({ found: false, error: expect.stringContaining(`${MAX_SEARCHES_PER_ANSWER} times`) });
		expect(slack.of("assistant.search.context")).toHaveLength(MAX_SEARCHES_PER_ANSWER);
		expect(notes).toEqual(["search_slack \"nothing here\": 0 results", "search_slack \"again\": Slack refused the search", "search_slack \"try 2\": 0 results", "search_slack \"try 3\": 0 results"]);
	});

	it("doesn't search once the run has asked a question, so the paused run holds no results", async () => {
		const slack = new FakeSlack();
		slack.searchResponse = RESPONSE;
		const notes: string[] = [];
		const { tool, counted } = makeTool(slack, { files: true, notes, questionAsked: () => true });
		await expect(execute(tool, { query: "launch plan" })).resolves.toEqual({ found: false, error: expect.stringContaining("can't search Slack until they answer") });
		expect(slack.of("assistant.search.context")).toEqual([]);
		expect(counted.searches).toBe(0);
		expect(notes).toEqual([]);
	});
});

describe("an answer that searched Slack", () => {
	it("counts as searched once its turn made a search, or once the turn has ended", async () => {
		const counts: Array<number | null> = [0, 1, 4, null];
		const searched = searchedThisAnswer({ searchCount: async (turnId) => (turnId === 7 ? counts.shift()! : 0) }, 7);
		expect([await searched(), await searched(), await searched(), await searched()]).toEqual([false, true, true, true]);
	});

	it("saves nothing: tools that keep text get a refusal to pass on", async () => {
		await expect(savingRefusal(async () => false)).resolves.toBeNull();
		await expect(savingRefusal(async () => true)).resolves.toBe("Nothing was saved: you searched Slack in this answer, and Slack's terms don't allow keeping anything its search finds, so nothing can be saved in it. Say so.");
	});

	it("is explained to the model whenever it can search", () => {
		expect(searchInstructions("on", "U0PERSON01", false)).toContain("once you've searched in an answer you can't ask a question with ask_question, save notes, pins, to-dos, skills or recurring tasks, or publish shared pages");
		expect(searchInstructions("off", "U0PERSON01", false)).not.toContain("ask_question");
		expect(searchInstructions("scheduled", "U0PERSON01", false)).toBe("You can't search Slack messages in a scheduled run: Slack lets you search only while answering someone's message. If the task needs a Slack search, say so.");
	});
});
