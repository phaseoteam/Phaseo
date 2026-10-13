import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ rpc: mocks.rpc }) }));

const { parseFeedbackAnswers, publicFeedbackRouter } = await import("./feedback");

const app = new Hono<{ Bindings: Env }>();
app.route("/feedback", publicFeedbackRouter);
const token = "0f8fad5b-d9cb-469f-a165-70867728950e";
const env = { ENV: "production" } as Env;
const post = (path: string, body: unknown, bindings: Partial<Env> = {}) => app.request(
	`https://phaseo.app/feedback/${path}`,
	{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
	{ ...env, ...bindings },
);

describe("public feedback routes", () => {
	beforeEach(() => mocks.rpc.mockReset());

	it("rejects malformed tokens without touching the database", async () => {
		const response = await app.request("https://phaseo.app/feedback/not-a-token", {}, env);
		expect(response.status).toBe(404);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it("returns the page data for a known token and 404 for an unknown one", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { segment: "paid", responded: false }, error: null });
		const known = await app.request(`https://phaseo.app/feedback/${token}`, {}, env);
		expect(known.status).toBe(200);
		expect(known.headers.get("cache-control")).toBe("private, no-store");
		expect(await known.json()).toEqual({ segment: "paid", responded: false });
		expect(mocks.rpc).toHaveBeenCalledWith("get_feedback_request", { p_token: token });

		mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
		expect((await app.request(`https://phaseo.app/feedback/${token}`, {}, env)).status).toBe(404);
	});

	it("submits cleaned answers with the $1 reward and 100-response cap by default", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { status: "submitted", rewardStatus: "issued", rewardCode: "THANKS-ABC" }, error: null });
		const response = await post(token, { answers: { reason: " Pricing is unclear ", rating: 4, details: "  " } });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "submitted", rewardStatus: "issued", rewardCode: "THANKS-ABC" });
		expect(mocks.rpc).toHaveBeenCalledWith("submit_feedback_response", {
			p_token: token,
			p_answers: { reason: "Pricing is unclear", rating: 4 },
			p_reward_nanos: 1_000_000_000,
			p_reward_cap: 100,
			p_reward_valid_days: 90,
		});
	});

	it("turns the reward off when it is configured as zero", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { status: "submitted", rewardStatus: "none" }, error: null });
		await post(token, { answers: { reason: "x" } }, { FEEDBACK_REWARD_USD: "0" });
		expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_reward_nanos: 0 });
	});

	it("rejects answers that are not a small flat object", async () => {
		for (const answers of [undefined, [], {}, { reason: "" }, { "Bad Key": "x" }, { reason: { nested: true } }, { reason: "x".repeat(4_001) }]) {
			expect((await post(token, { answers })).status).toBe(400);
		}
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it("unsubscribes a known token, including one-click form posts from mail clients", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
		const response = await app.request(`https://phaseo.app/feedback/${token}/unsubscribe`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "List-Unsubscribe=One-Click",
		}, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ unsubscribed: true });
		expect(mocks.rpc).toHaveBeenCalledWith("opt_out_of_product_emails", { p_token: token });

		mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
		expect((await post(`${token}/unsubscribe`, {})).status).toBe(404);
	});

	it("reports database failures as unavailable", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("down") });
		expect((await app.request(`https://phaseo.app/feedback/${token}`, {}, env)).status).toBe(503);
	});
});

describe("parseFeedbackAnswers", () => {
	it("keeps trimmed strings and finite numbers only", () => {
		expect(parseFeedbackAnswers({ a: " x ", b: 3, c: "" })).toEqual({ a: "x", b: 3 });
		expect(parseFeedbackAnswers({ a: Number.NaN })).toBeNull();
		expect(parseFeedbackAnswers(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, "x"])))).toBeNull();
	});
});
