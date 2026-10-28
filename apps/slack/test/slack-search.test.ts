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
	zeroRetentionModels,
} from "../src/slack-search";
import { DbError } from "../src/supabase";
import { FakeDb, FakeSlack } from "./fakes";

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

describe("Slack search: models that keep no data", () => {
	const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
	const PRIVATE = { status: "active", routing_enabled: true, zero_data_retention: true, data_policy_tier: "private", data_policy_confidence: "confirmed", prompt_training_policy: "no_train" };

	/** A catalogue with `model`'s routes, each to its own provider with the fields given. */
	function catalogue(entries: Array<{ model: string; provider: string; route?: Record<string, unknown>; fields?: Record<string, unknown> }>): FakeDb {
		const db = new FakeDb();
		db.tables.v2_model_provider_routes = entries.map((entry) => ({ model_slug: entry.model, provider_slug: entry.provider, routing_enabled: true, status: "active", effective_from: null, effective_to: null, ...entry.route }));
		db.tables.v2_providers = entries.map((entry) => ({ provider_slug: entry.provider, ...PRIVATE, ...entry.fields }));
		return db;
	}

	it("are those with a route to a provider that keeps no data and that the agent's guardrail allows", async () => {
		const db = catalogue([
			{ model: "openai/gpt-zdr", provider: "zdr-cloud" },
			// One provider of several is enough.
			{ model: "acme/two-routes", provider: "logs-cloud", fields: { zero_data_retention: false, data_policy_tier: "logs" } },
			{ model: "acme/two-routes", provider: "zdr-two" },
			{ model: "acme/logs-only", provider: "logs-only", fields: { zero_data_retention: false, data_policy_tier: "logs" } },
			// Keeps no data, but trains on prompts or hasn't a confirmed policy: the guardrail drops it.
			{ model: "acme/trains", provider: "zdr-trains", fields: { data_policy_tier: "trains" } },
			{ model: "acme/unconfirmed", provider: "zdr-maybe", fields: { data_policy_confidence: "maybe" } },
			{ model: "acme/unknown", provider: "zdr-unknown", fields: { data_policy_tier: null, prompt_training_policy: null } },
			// The training policy stands in for a missing tier, as the gateway reads it.
			{ model: "acme/no-tier", provider: "zdr-no-tier", fields: { data_policy_tier: null, prompt_training_policy: "no_train" } },
			// Routes and providers the gateway doesn't route to.
			{ model: "acme/disabled", provider: "zdr-disabled", route: { routing_enabled: false } },
			{ model: "acme/retired", provider: "zdr-retired", route: { status: "retired" } },
			{ model: "acme/ended", provider: "zdr-ended", route: { effective_to: "2026-10-01T00:00:00Z" } },
			{ model: "acme/later", provider: "zdr-later", route: { effective_from: "2026-11-01T00:00:00Z" } },
			{ model: "acme/beta", provider: "zdr-beta", fields: { status: "beta" } },
			{ model: "acme/off", provider: "zdr-off", fields: { routing_enabled: false } },
			{ model: "acme/degraded", provider: "zdr-degraded", route: { status: "degraded" } },
		]);
		const all = db.tables.v2_model_provider_routes.map((route) => String(route.model_slug));
		await expect(zeroRetentionModels(db, all, NOW)).resolves.toEqual(new Set(["openai/gpt-zdr", "acme/two-routes", "acme/no-tier", "acme/degraded"]));
		// Two reads: the models' routes, then their providers that keep no data.
		expect(db.queries.map((query) => query.table)).toEqual(["v2_model_provider_routes", "v2_providers"]);
		expect(db.queries[1].query.zero_data_retention).toBe("eq.true");
	});

	it("never include Auto, and are none when the catalogue can't be read", async () => {
		const db = catalogue([{ model: "openai/gpt-zdr", provider: "zdr-cloud" }]);
		await expect(zeroRetentionModels(db, ["phaseo/auto"], NOW)).resolves.toEqual(new Set());
		expect(db.queries).toEqual([]);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		db.select = async () => { throw new DbError(503, null); };
		await expect(zeroRetentionModels(db, ["openai/gpt-zdr"], NOW)).resolves.toEqual(new Set());
	});

	it("are explained to the model when its own can't search, with the models that could", () => {
		expect(searchInstructions("on", "U0PERSON01", false)).toContain("after a search every model request of the answer goes only to AI providers that keep no data (zero data retention)");
		expect(searchInstructions("needs_zdr", "U0PERSON01", false, { name: "Claude Test", auto: false, choices: [] })).toBe(
			"You can't search Slack messages with Claude Test: Slack's terms don't allow keeping what its search finds, so an answer that searches Slack may only use AI providers that keep no data (zero data retention), and Claude Test has no provider that does. If asked to search Slack, say so, and that an admin can choose a model that keeps no data for the agent in Phaseo (Settings → Slack).",
		);
		const auto = searchInstructions("needs_zdr", "U0PERSON01", false, { name: "Auto", auto: true, choices: ["GPT Test"] });
		expect(auto).toContain("You can't search Slack messages with Auto:");
		expect(auto).toContain("Auto picks a model for each request and can't promise one.");
		expect(auto).toContain("they can ask again with a model that keeps no data by starting the message with `with <model>:` (GPT Test), or an admin can choose one for the agent in Phaseo (Settings → Slack).");
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
