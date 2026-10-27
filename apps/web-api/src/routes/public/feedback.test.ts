import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), unsubscribeResendContact: vi.fn() }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/auth/resendContacts", () => ({ unsubscribeResendContact: mocks.unsubscribeResendContact }));

const { FEEDBACK_SURVEY, parseFeedbackAnswers, publicFeedbackRouter } = await import("./feedback");

const app = new Hono<{ Bindings: Env }>();
app.route("/feedback", publicFeedbackRouter);
const token = "0f8fad5b-d9cb-469f-a165-70867728950e";
const env = { ENV: "production", POSTHOG_PROJECT_API_KEY: "phc_test" } as Env;
const fetchMock = vi.fn();
const openRequest = {
	requestId: "6b1f3c2e-8d4a-4f5b-9c7e-1a2b3c4d5e6f",
	userId: "00000000-0000-0000-0000-00000000000a",
	campaign: "v1",
	segment: "used_not_paid",
	recency: "lapsed",
	responded: false,
	rewardCode: null,
	optedOut: false,
	rewardsIssued: 0,
};
const post = (path: string, body: unknown, bindings: Partial<Env> = {}) => app.request(
	`https://phaseo.app/feedback/${path}`,
	{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
	{ ...env, ...bindings },
);

describe("public feedback routes", () => {
	beforeEach(() => {
		mocks.rpc.mockReset();
		mocks.unsubscribeResendContact.mockReset().mockResolvedValue(undefined);
		fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ status: "Ok" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("rejects malformed tokens without touching the database", async () => {
		const response = await app.request("https://phaseo.app/feedback/not-a-token", {}, env);
		expect(response.status).toBe(404);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it("returns the page data for a known token and 404 for an unknown one", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { segment: "paid", responded: false, rewardsIssued: 3 }, error: null });
		const known = await app.request(`https://phaseo.app/feedback/${token}`, {}, env);
		expect(known.status).toBe(200);
		expect(known.headers.get("cache-control")).toBe("private, no-store");
		expect(await known.json()).toEqual({ segment: "paid", responded: false, rewardAvailable: true });
		expect(mocks.rpc).toHaveBeenCalledWith("get_feedback_request", { p_token: token });

		mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
		expect((await app.request(`https://phaseo.app/feedback/${token}`, {}, env)).status).toBe(404);
	});

	it("stops offering a reward once the cap is spent or rewards are off", async () => {
		const rewardAvailable = async (rewardsIssued: number, bindings: Partial<Env> = {}) => {
			mocks.rpc.mockResolvedValueOnce({ data: { segment: "paid", responded: false, rewardsIssued }, error: null });
			const response = await app.request(`https://phaseo.app/feedback/${token}`, {}, { ...env, ...bindings });
			return ((await response.json()) as { rewardAvailable: boolean }).rewardAvailable;
		};
		expect(await rewardAvailable(99)).toBe(true);
		expect(await rewardAvailable(100)).toBe(false);
		expect(await rewardAvailable(0, { FEEDBACK_REWARD_USD: "0" })).toBe(false);
		expect(await rewardAvailable(0, { FEEDBACK_REWARD_CAP: "0" })).toBe(false);
	});

	it("strips the PostHog ids from the page data", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { ...openRequest, rewardsIssued: 0 }, error: null });
		const body = await (await app.request(`https://phaseo.app/feedback/${token}`, {}, env)).json();
		expect(body).not.toHaveProperty("requestId");
		expect(body).not.toHaveProperty("userId");
	});

	it("sends the answers to the PostHog survey, then records the response with the $1 reward and 100-response cap", async () => {
		mocks.rpc
			.mockResolvedValueOnce({ data: openRequest, error: null })
			.mockResolvedValueOnce({ data: { status: "submitted", rewardStatus: "issued", rewardCode: "THANKS-ABC" }, error: null });
		const response = await post(token, { answers: { reason: "pricing_unclear", details: " Too many tiers ", likes: "  " } });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "submitted", rewardStatus: "issued", rewardCode: "THANKS-ABC" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
		const event = JSON.parse(String(init.body));
		expect(event).toMatchObject({
			api_key: "phc_test",
			event: "survey sent",
			distinct_id: openRequest.userId,
			uuid: openRequest.requestId,
			properties: {
				$survey_id: FEEDBACK_SURVEY.id,
				$survey_submission_id: openRequest.requestId,
				$survey_completed: true,
				[`$survey_response_${FEEDBACK_SURVEY.questions[0].id}`]: "Pricing was unclear",
				[`$survey_response_${FEEDBACK_SURVEY.questions[1].id}`]: "Too many tiers",
				$survey_response: "Pricing was unclear",
				$survey_response_1: "Too many tiers",
				segment: "used_not_paid",
				recency: "lapsed",
				campaign: "v1",
			},
		});
		expect(event.properties).not.toHaveProperty(`$survey_response_${FEEDBACK_SURVEY.questions[3].id}`);

		expect(mocks.rpc).toHaveBeenNthCalledWith(1, "get_feedback_request", { p_token: token });
		expect(mocks.rpc).toHaveBeenNthCalledWith(2, "submit_feedback_response", {
			p_token: token,
			p_reward_nanos: 1_000_000_000,
			p_reward_cap: 100,
			p_reward_valid_days: 90,
		});
	});

	it("sends a 0-10 score as text under the rating question, as PostHog expects", async () => {
		mocks.rpc
			.mockResolvedValueOnce({ data: { ...openRequest, segment: "paid" }, error: null })
			.mockResolvedValueOnce({ data: { status: "submitted", rewardStatus: "issued", rewardCode: "THANKS-ABC" }, error: null });
		await post(token, { answers: { nps: 0, improve: "Cheaper Opus" } });
		const { properties } = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
		expect(properties[`$survey_response_${FEEDBACK_SURVEY.questions[2].id}`]).toBe("0");
		expect(properties.$survey_response_2).toBe("0");
		expect(properties.$survey_response_4).toBe("Cheaper Opus");
	});

	it("records nothing when PostHog does not accept the answers, so the user can send again", async () => {
		for (const failure of [
			() => fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 })),
			() => fetchMock.mockRejectedValueOnce(new Error("timeout")),
		]) {
			mocks.rpc.mockReset().mockResolvedValueOnce({ data: openRequest, error: null });
			failure();
			expect((await post(token, { answers: { reason: "other" } })).status).toBe(503);
			expect(mocks.rpc).toHaveBeenCalledTimes(1);
		}

		mocks.rpc.mockReset().mockResolvedValueOnce({ data: openRequest, error: null });
		fetchMock.mockClear();
		expect((await post(token, { answers: { reason: "other" } }, { POSTHOG_PROJECT_API_KEY: "" })).status).toBe(503);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mocks.rpc).toHaveBeenCalledTimes(1);
	});

	it("returns the original code without resending answers that were already sent", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { ...openRequest, responded: true, rewardCode: "THANKS-OLD" }, error: null });
		const response = await post(token, { answers: { reason: "other" } });
		expect(await response.json()).toEqual({ status: "already_submitted", rewardStatus: null, rewardCode: "THANKS-OLD" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mocks.rpc).toHaveBeenCalledTimes(1);
	});

	it("returns 404 for an unknown token without contacting PostHog", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
		expect((await post(token, { answers: { reason: "other" } })).status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("turns the reward off when it is configured as zero", async () => {
		mocks.rpc
			.mockResolvedValueOnce({ data: openRequest, error: null })
			.mockResolvedValueOnce({ data: { status: "submitted", rewardStatus: "none" }, error: null });
		await post(token, { answers: { reason: "other" } }, { FEEDBACK_REWARD_USD: "0" });
		expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_reward_nanos: 0 });
	});

	it("rejects answers the survey does not ask for", async () => {
		for (const answers of [
			undefined,
			[],
			{},
			{ details: "only text" },
			{ reason: "" },
			{ reason: "not_a_reason" },
			{ reason: "other", rating: 4 },
			{ reason: { nested: true } },
			{ reason: "other", details: "x".repeat(3_001) },
			{ nps: 11 },
			{ nps: 4.5 },
		]) {
			expect((await post(token, { answers })).status).toBe(400);
		}
		expect(mocks.rpc).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("unsubscribes a known token, including one-click form posts from mail clients", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { emails: ["ada@example.com", "ada.old@example.com"] }, error: null });
		const response = await app.request(`https://phaseo.app/feedback/${token}/unsubscribe`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "List-Unsubscribe=One-Click",
		}, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ unsubscribed: true });
		expect(mocks.rpc).toHaveBeenCalledWith("opt_out_of_product_emails", { p_token: token });
		expect(mocks.unsubscribeResendContact.mock.calls.map((call) => call[1])).toEqual(["ada@example.com", "ada.old@example.com"]);

		mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
		expect((await post(`${token}/unsubscribe`, {})).status).toBe(404);
	});

	it("fails the unsubscribe when Resend cannot be updated, so it can be repeated", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { emails: ["ada@example.com"] }, error: null });
		mocks.unsubscribeResendContact.mockRejectedValueOnce(new Error("resend_contact_unsubscribe_failed:rate_limit"));
		expect((await post(`${token}/unsubscribe`, {})).status).toBe(503);
	});

	it("reports database failures as unavailable", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("down") });
		expect((await app.request(`https://phaseo.app/feedback/${token}`, {}, env)).status).toBe(503);
	});
});

describe("parseFeedbackAnswers", () => {
	it("keeps a known reason or score and trimmed, non-empty text", () => {
		expect(parseFeedbackAnswers({ reason: "model_missing", details: " Kimi " })).toEqual({ reason: "model_missing", details: "Kimi" });
		expect(parseFeedbackAnswers({ nps: 10, likes: "", improve: "反".repeat(3_000) })).toEqual({ nps: 10, improve: "反".repeat(3_000) });
		expect(parseFeedbackAnswers({ reason: "toString" })).toBeNull();
		expect(parseFeedbackAnswers({ nps: Number.NaN })).toBeNull();
	});

	it("knows every reason the feedback page offers", () => {
		const reasons = ["setup_unclear", "pricing_unclear", "model_missing", "model_choice_unclear", "payment_issue", "chose_alternative", "just_exploring", "not_ready_yet", "other"];
		for (const reason of reasons) expect(parseFeedbackAnswers({ reason })).toEqual({ reason });
	});
});
