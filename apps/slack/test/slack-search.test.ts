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
	const WORKSPACE = "ws_slack_test";
	const PRIVATE = { status: "active", routing_enabled: true, credential_mode: "managed_and_byok", zero_data_retention: true, data_policy_tier: "private", data_policy_confidence: "confirmed", prompt_training_policy: "no_train" };
	/** A capability's own policy that keeps no data, as v2_effective_route_capabilities gives it in params.data_policy. */
	const KEEPS_NOTHING = { tier: "private", confidence: "confirmed", zeroDataRetention: true };

	/**
	 * A catalogue with `model`'s routes, each to its own provider with the fields given, and the capabilities
	 * (text.generate unless given) whose data_policy each declares.
	 */
	function catalogue(entries: Array<{ model: string; provider: string; route?: Record<string, unknown>; fields?: Record<string, unknown>; capabilities?: Array<{ capability_id?: string; status?: string; data_policy: Record<string, unknown> }> }>): FakeDb {
		const db = new FakeDb();
		const id = (entry: { model: string; provider: string }) => `${entry.provider}:${entry.model}`;
		db.tables.v2_model_provider_routes = entries.map((entry) => ({ model_slug: entry.model, provider_slug: entry.provider, provider_model_id: id(entry), credential_mode: "managed_and_byok", routing_enabled: true, status: "active", effective_from: null, effective_to: null, ...entry.route }));
		db.tables.v2_providers = entries.map((entry) => ({ provider_slug: entry.provider, ...PRIVATE, ...entry.fields }));
		db.tables.v2_effective_route_capabilities = entries.flatMap((entry) => (entry.capabilities ?? []).map(({ data_policy, ...capability }) => ({
			provider_model_id: id(entry), capability_id: "text.generate", status: "active", ...capability, params: { reasoning: { supported: true }, data_policy },
		})));
		db.tables.byok_keys = [];
		return db;
	}

	/** The db, with reads of `table` failing as if Postgres were unavailable. */
	function failing(db: FakeDb, table: string): FakeDb {
		const select = db.select.bind(db);
		db.select = (async (from: string, query: Record<string, string>) => {
			if (from === table) throw new DbError(503, null);
			return select(from, query);
		}) as FakeDb["select"];
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
		await expect(zeroRetentionModels(db, all, NOW, WORKSPACE)).resolves.toEqual(new Set(["openai/gpt-zdr", "acme/two-routes", "acme/no-tier", "acme/degraded"]));
		// The models' routes, then together their providers, their capabilities' policies and the workspace's provider keys.
		expect(db.queries.map((query) => query.table)).toEqual(["v2_model_provider_routes", "v2_providers", "v2_effective_route_capabilities", "byok_keys"]);
		// Every provider: a capability can keep no data where its provider doesn't.
		expect(db.queries[1].query).not.toHaveProperty("zero_data_retention");
		expect(db.queries[2].query).toMatchObject({ capability_id: 'in.("text.generate","responses")', status: 'in.("active","deranked","deranked_lvl1","deranked_lvl2","deranked_lvl3")' });
		expect(db.queries[3].query).toMatchObject({ workspace_id: `eq.${WORKSPACE}`, enabled: "eq.true" });
	});

	it("read a route's policy as the gateway does: its capability's own, where it declares one, ahead of its provider's", async () => {
		const db = catalogue([
			// The provider keeps logs, but this model's capability is verified to keep nothing.
			{ model: "acme/capability-zdr", provider: "logs-cloud", fields: { zero_data_retention: false, data_policy_tier: "logs" }, capabilities: [{ data_policy: KEEPS_NOTHING }] },
			// The same promise made only for the Responses capability.
			{ model: "acme/responses-zdr", provider: "logs-two", fields: { zero_data_retention: false, data_policy_tier: "logs" }, capabilities: [{ capability_id: "responses", data_policy: KEEPS_NOTHING }] },
			// text.generate's declaration comes first: here it withdraws what responses' promises.
			{ model: "acme/text-first", provider: "logs-three", fields: { zero_data_retention: false }, capabilities: [{ capability_id: "responses", data_policy: KEEPS_NOTHING }, { data_policy: { ...KEEPS_NOTHING, zeroDataRetention: false } }] },
			// The provider keeps no data, but this capability isn't eligible.
			{ model: "acme/withdrawn", provider: "zdr-withdrawn", capabilities: [{ data_policy: { tier: "private", confidence: "confirmed", zdrEligibility: "ineligible" } }] },
			// A catalogue's declaration counts only until its validUntil.
			{ model: "acme/catalogue-current", provider: "logs-four", fields: { zero_data_retention: false }, capabilities: [{ data_policy: { ...KEEPS_NOTHING, catalogManaged: true, validUntil: "2026-10-29T00:00:00Z" } }] },
			{ model: "acme/catalogue-expired", provider: "zdr-expired", capabilities: [{ data_policy: { ...KEEPS_NOTHING, catalogManaged: true, validUntil: "2026-10-28T11:00:00Z" } }] },
			// A declaration without a confidence leaves it unknown, so the guardrail drops the route.
			{ model: "acme/no-confidence", provider: "logs-five", fields: { zero_data_retention: false }, capabilities: [{ data_policy: { zeroDataRetention: true } }] },
			// A capability the gateway doesn't route to declares nothing.
			{ model: "acme/disabled-capability", provider: "logs-six", fields: { zero_data_retention: false }, capabilities: [{ status: "disabled", data_policy: KEEPS_NOTHING }] },
			// One that declares nothing about retention keeps its provider's.
			{ model: "acme/inherits", provider: "zdr-inherits", capabilities: [{ data_policy: { tier: "private", confidence: "confirmed" } }] },
		]);
		// An empty text.generate params object counts as no data, as the gateway reads it: responses' declaration applies.
		db.tables.v2_model_provider_routes.push({ model_slug: "acme/empty-text", provider_slug: "logs-seven", provider_model_id: "logs-seven:acme/empty-text", credential_mode: "managed_and_byok", routing_enabled: true, status: "active", effective_from: null, effective_to: null });
		db.tables.v2_providers.push({ provider_slug: "logs-seven", ...PRIVATE, zero_data_retention: false });
		db.tables.v2_effective_route_capabilities.push(
			{ provider_model_id: "logs-seven:acme/empty-text", capability_id: "text.generate", status: "active", params: {} },
			{ provider_model_id: "logs-seven:acme/empty-text", capability_id: "responses", status: "active", params: { data_policy: KEEPS_NOTHING } },
		);
		const all = db.tables.v2_model_provider_routes.map((route) => String(route.model_slug));
		await expect(zeroRetentionModels(db, all, NOW, WORKSPACE)).resolves.toEqual(new Set(["acme/capability-zdr", "acme/responses-zdr", "acme/catalogue-current", "acme/inherits", "acme/empty-text"]));

		// Policies that can't be read leave the providers', erring towards offering search: the gateway still enforces it.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await expect(zeroRetentionModels(failing(db, "v2_effective_route_capabilities"), all, NOW, WORKSPACE)).resolves.toEqual(new Set(["acme/withdrawn", "acme/catalogue-expired", "acme/inherits"]));
		expect(warn).toHaveBeenCalledWith("[slack-agent] route data policies not read");
		warn.mockRestore();
	});

	it("count a route that takes only the workspace's own provider key when the workspace has one", async () => {
		const db = catalogue([
			{ model: "acme/byok-provider", provider: "byok-cloud", fields: { credential_mode: "byok_only" } },
			{ model: "acme/byok-route", provider: "zdr-route", route: { credential_mode: "byok_only" } },
			{ model: "acme/managed", provider: "zdr-managed" },
		]);
		const all = db.tables.v2_model_provider_routes.map((route) => String(route.model_slug));
		await expect(zeroRetentionModels(db, all, NOW, WORKSPACE)).resolves.toEqual(new Set(["acme/managed"]));
		// Another workspace's key, or a disabled one, isn't the agent's.
		db.tables.byok_keys = [
			{ id: "byok_1", workspace_id: "ws_other", provider_id: "byok-cloud", enabled: true },
			{ id: "byok_2", workspace_id: WORKSPACE, provider_id: "zdr-route", enabled: false },
		];
		await expect(zeroRetentionModels(db, all, NOW, WORKSPACE)).resolves.toEqual(new Set(["acme/managed"]));
		db.tables.byok_keys.push(
			{ id: "byok_3", workspace_id: WORKSPACE, provider_id: "byok-cloud", enabled: true },
			{ id: "byok_4", workspace_id: WORKSPACE, provider_id: "zdr-route", enabled: true },
		);
		await expect(zeroRetentionModels(db, all, NOW, WORKSPACE)).resolves.toEqual(new Set(all));
		// Keys that can't be read leave the routes Phaseo's own credentials serve.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await expect(zeroRetentionModels(failing(db, "byok_keys"), all, NOW, WORKSPACE)).resolves.toEqual(new Set(["acme/managed"]));
		expect(warn).toHaveBeenCalledWith("[slack-agent] provider keys not read");
		warn.mockRestore();
	});

	it("always include Auto, whose router picks only models that keep no data, and no other model when the routes or providers can't be read", async () => {
		const db = catalogue([{ model: "openai/gpt-zdr", provider: "zdr-cloud" }]);
		await expect(zeroRetentionModels(db, ["phaseo/auto"], NOW, WORKSPACE)).resolves.toEqual(new Set(["phaseo/auto"]));
		expect(db.queries).toEqual([]);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await expect(zeroRetentionModels(failing(catalogue([{ model: "openai/gpt-zdr", provider: "zdr-cloud" }]), "v2_providers"), ["openai/gpt-zdr", "phaseo/auto"], NOW, WORKSPACE)).resolves.toEqual(new Set(["phaseo/auto"]));
		db.select = async () => { throw new DbError(503, null); };
		await expect(zeroRetentionModels(db, ["openai/gpt-zdr"], NOW, WORKSPACE)).resolves.toEqual(new Set());
		vi.restoreAllMocks();
	});

	it("are explained to the model when its own can't search, with the models that could", () => {
		expect(searchInstructions("on", "U0PERSON01", false)).toContain("after a search every model request of the answer goes only to AI providers that keep no data (zero data retention)");
		expect(searchInstructions("needs_zdr", "U0PERSON01", false, { name: "Claude Test", choices: [] })).toBe(
			"You can't search Slack messages with Claude Test: Slack's terms don't allow keeping what its search finds, so an answer that searches Slack may only use AI providers that keep no data (zero data retention), and Claude Test has no provider that does. If asked to search Slack, say so, and that an admin can choose a model that keeps no data for the agent in Phaseo (Settings → Slack).",
		);
		const choices = searchInstructions("needs_zdr", "U0PERSON01", false, { name: "GPT Logged", choices: ["GPT Test", "Auto"] });
		expect(choices).toContain("You can't search Slack messages with GPT Logged:");
		expect(choices).toContain("they can ask again with a model that keeps no data by starting the message with `with <model>:` (GPT Test, Auto), or an admin can choose one for the agent in Phaseo (Settings → Slack).");
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
