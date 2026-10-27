import { describe, expect, it, vi } from "vitest";
import { refusalText, userFacts } from "../src/access";
import { createSlackClient, refreshBotToken } from "../src/slack-api";
import { createDb, DbError } from "../src/supabase";

describe("Supabase client", () => {
	it("sends the service role key and PostgREST filters", async () => {
		const fetchMock = vi.fn(async () => Response.json([{ id: "x" }]));
		const db = createDb({ SUPABASE_URL: "https://supabase.test/", SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" }, fetchMock as unknown as typeof fetch);
		await expect(db.select("slack_installations", { select: "id", team_id: "eq.T0TEST0001", slack_app_id: "is.null" })).resolves.toEqual([{ id: "x" }]);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://supabase.test/rest/v1/slack_installations?select=id&team_id=eq.T0TEST0001&slack_app_id=is.null");
		expect(init.headers).toMatchObject({ apikey: "test-service-role-key", Authorization: "Bearer test-service-role-key" });
	});

	it("calls RPCs with JSON and reports only PostgREST's error code", async () => {
		const fetchMock = vi.fn(async () => Response.json({ code: "22023", message: "invalid_people with details" }, { status: 400 }));
		const db = createDb({ SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" }, fetchMock as unknown as typeof fetch);
		const error = await db.rpc("record_slack_agent_people", { p_people: [] }).then(() => null, (caught: unknown) => caught as DbError);
		expect(error).toBeInstanceOf(DbError);
		expect(error?.message).toBe("db_error_400_22023");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://supabase.test/rest/v1/rpc/record_slack_agent_people");
		expect(init.body).toBe(JSON.stringify({ p_people: [] }));
		await expect(createDb({}).select("x", {})).rejects.toThrow("db_error_0_unconfigured");
	});
});

describe("Slack client", () => {
	it("sends form fields to read methods and JSON to write methods", async () => {
		const fetchMock = vi.fn(async () => Response.json({ ok: true, user: { id: "U0PERSON01" } }));
		const slack = createSlackClient("xoxb-1-test-token", fetchMock as unknown as typeof fetch);
		await slack.call("users.info", { user: "U0PERSON01" }, { form: true });
		await slack.call("chat.postEphemeral", { channel: "C0CHANNEL1", user: "U0PERSON01", text: "hi" });
		const [[usersUrl, usersInit], [postUrl, postInit]] = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
		expect(usersUrl).toBe("https://slack.com/api/users.info");
		expect(usersInit.body).toBe("user=U0PERSON01");
		expect(usersInit.headers).toMatchObject({ Authorization: "Bearer xoxb-1-test-token", "Content-Type": "application/x-www-form-urlencoded" });
		expect(postUrl).toBe("https://slack.com/api/chat.postEphemeral");
		expect(JSON.parse(String(postInit.body))).toEqual({ channel: "C0CHANNEL1", user: "U0PERSON01", text: "hi" });
	});

	it("turns Slack errors and rate limits into results", async () => {
		const responses = [
			Response.json({ ok: false, error: "channel_not_found" }),
			new Response("", { status: 429, headers: { "Retry-After": "30" } }),
		];
		const slack = createSlackClient("xoxb-1-test-token", (async () => responses.shift()!) as unknown as typeof fetch);
		await expect(slack.call("chat.postEphemeral", {})).resolves.toEqual({ ok: false, error: "channel_not_found" });
		await expect(slack.call("conversations.replies", {}, { form: true })).resolves.toEqual({ ok: false, error: "ratelimited", retryAfterSeconds: 30 });
	});

	it("refreshes a rotating bot token and refuses an unexpected answer", async () => {
		const good = vi.fn(async () => Response.json({ ok: true, access_token: "xoxe.xoxb-1-test-new", refresh_token: "xoxe-1-test-next", expires_in: 43_200, token_type: "bot" }));
		await expect(refreshBotToken({ clientId: "1.2", clientSecret: "test-secret", refreshToken: "xoxe-1-test-old", fetchImpl: good as unknown as typeof fetch })).resolves.toEqual({
			ok: true,
			data: { botToken: "xoxe.xoxb-1-test-new", refreshToken: "xoxe-1-test-next", expiresInSeconds: 43_200 },
		});
		const [, init] = good.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.headers).toMatchObject({ Authorization: `Basic ${btoa("1.2:test-secret")}` });
		const bad = (async () => Response.json({ ok: true, access_token: "not-a-token", refresh_token: "xoxe-1-test-next", expires_in: 43_200 })) as unknown as typeof fetch;
		await expect(refreshBotToken({ clientId: "1.2", clientSecret: "s", refreshToken: "xoxe-1-test-old", fetchImpl: bad })).resolves.toEqual({ ok: false, error: "slack_response_invalid" });
		const refused = (async () => Response.json({ ok: false, error: "invalid_refresh_token" })) as unknown as typeof fetch;
		await expect(refreshBotToken({ clientId: "1.2", clientSecret: "s", refreshToken: "xoxe-1-test-old", fetchImpl: refused })).resolves.toEqual({ ok: false, error: "invalid_refresh_token" });
	});
});

describe("user facts and replies", () => {
	const installation = { team_id: "T0TEST0001", enterprise_id: null };

	it("reads bots, guests and Slack Connect users from users.info", () => {
		expect(userFacts({ id: "U0PERSON01", team_id: "T0TEST0001" }, installation)).toEqual({ isBot: false, isExternal: false, isGuest: false });
		expect(userFacts({ id: "U0BOTUSER1", team_id: "T0TEST0001", is_bot: true }, installation).isBot).toBe(true);
		expect(userFacts({ id: "USLACKBOT", team_id: "T0TEST0001" }, installation).isBot).toBe(true);
		expect(userFacts({ id: "U0GUEST001", team_id: "T0TEST0001", is_restricted: true }, installation).isGuest).toBe(true);
		expect(userFacts({ id: "U0GUEST002", team_id: "T0TEST0001", is_ultra_restricted: true }, installation).isGuest).toBe(true);
		expect(userFacts({ id: "U0OUTSIDE1", team_id: "T0TEST0001", is_stranger: true }, installation).isExternal).toBe(true);
		expect(userFacts({ id: "U0OUTSIDE2", team_id: "T0OTHER001" }, installation).isExternal).toBe(true);
		expect(userFacts({ id: "U0SISTER01", team_id: "T0SISTER01", enterprise_user: { enterprise_id: "E0ORG00001" } }, { team_id: "T0TEST0001", enterprise_id: "E0ORG00001" }).isExternal).toBe(false);
		// An org-wide install: inside means a member of its enterprise, whatever is_stranger says.
		const org = { team_id: null, enterprise_id: "E0ORG00001" };
		expect(userFacts({ id: "U0MEMBER01", team_id: "T0SISTER01", enterprise_user: { enterprise_id: "E0ORG00001" } }, org).isExternal).toBe(false);
		expect(userFacts({ id: "U0PARTNER1", team_id: "T0PARTNER1", is_stranger: false }, org).isExternal).toBe(true);
		expect(userFacts({ id: "U0OTHERORG", team_id: "T0OTHER001", enterprise_user: { enterprise_id: "E0OTHER001" } }, org).isExternal).toBe(true);
	});

	it("words every refusal politely, with money in US format, and says nothing to bots", () => {
		expect(refusalText("bot")).toBeNull();
		expect(refusalText("plan_full", { tier: { people: 1_000, priceNanos: 59_000_000_000 } })).toContain("(1,000 people, $59.00 a month)");
		expect(refusalText("hourly_limit", { limit: 60 })).toBe("You've reached the limit of 60 answers an hour. Please try again a little later.");
		for (const reason of ["paused", "payment_due", "external_user", "guest", "max_people", "monthly_cap", "user_unverified", "busy"] as const) {
			expect(refusalText(reason)).toMatch(/\.$/);
		}
	});
});
