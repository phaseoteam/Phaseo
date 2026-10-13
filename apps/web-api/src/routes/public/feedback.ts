import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";

// Public routes behind the links in feedback request emails. The unguessable access
// token in the URL is the only credential: it reads and answers one request, and opts
// its user out of non-essential email.
export const publicFeedbackRouter = new Hono<{ Bindings: Env }>();

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWERS = 10;
const MAX_ANSWER_LENGTH = 4_000;
const ANSWER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const REWARD_VALID_DAYS = 90;

export type FeedbackAnswers = Record<string, string | number>;

/** Accepts a small flat object of short strings and finite numbers; anything else is rejected. */
export function parseFeedbackAnswers(value: unknown): FeedbackAnswers | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const entries = Object.entries(value as Record<string, unknown>);
	if (entries.length === 0 || entries.length > MAX_ANSWERS) return null;
	const answers: FeedbackAnswers = {};
	for (const [key, raw] of entries) {
		if (!ANSWER_KEY_PATTERN.test(key)) return null;
		if (typeof raw === "number" && Number.isFinite(raw)) {
			answers[key] = raw;
		} else if (typeof raw === "string") {
			const text = raw.trim();
			if (text.length > MAX_ANSWER_LENGTH) return null;
			if (text) answers[key] = text;
		} else {
			return null;
		}
	}
	return Object.keys(answers).length > 0 ? answers : null;
}

function rewardSettings(env: Env): { nanos: number; cap: number } {
	const usd = Number(env.FEEDBACK_REWARD_USD ?? "1");
	const cap = Number(env.FEEDBACK_REWARD_CAP ?? "100");
	return {
		nanos: Number.isFinite(usd) && usd > 0 ? Math.round(usd * 1_000_000_000) : 0,
		cap: Number.isInteger(cap) && cap > 0 ? cap : 0,
	};
}

publicFeedbackRouter.get("/:token", async (c) => {
	const token = c.req.param("token");
	if (!TOKEN_PATTERN.test(token)) return c.json({ error: "not_found" }, 404, NO_STORE);
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_feedback_request", { p_token: token });
		if (error) throw error;
		if (!data) return c.json({ error: "not_found" }, 404, NO_STORE);
		return c.json(data, 200, NO_STORE);
	} catch (error) {
		console.error("[web-api/feedback] lookup failed", { error });
		return c.json({ error: "feedback_unavailable" }, 503, NO_STORE);
	}
});

publicFeedbackRouter.post("/:token", async (c) => {
	const token = c.req.param("token");
	if (!TOKEN_PATTERN.test(token)) return c.json({ error: "not_found" }, 404, NO_STORE);
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid_request" }, 400, NO_STORE);
	}
	const answers = parseFeedbackAnswers((body as { answers?: unknown } | null)?.answers);
	if (!answers) return c.json({ error: "invalid_answers" }, 400, NO_STORE);

	const reward = rewardSettings(c.env);
	try {
		const { data, error } = await getDataClient(c.env).rpc("submit_feedback_response", {
			p_token: token,
			p_answers: answers,
			p_reward_nanos: reward.nanos,
			p_reward_cap: reward.cap,
			p_reward_valid_days: REWARD_VALID_DAYS,
		});
		if (error) throw error;
		const result = (data ?? {}) as { status?: string; rewardStatus?: string; rewardCode?: string | null };
		if (result.status === "not_found") return c.json({ error: "not_found" }, 404, NO_STORE);
		if (result.status === "invalid_answers") return c.json({ error: "invalid_answers" }, 400, NO_STORE);
		return c.json({
			status: result.status,
			rewardStatus: result.rewardStatus ?? null,
			rewardCode: result.rewardCode ?? null,
		}, 200, NO_STORE);
	} catch (error) {
		console.error("[web-api/feedback] submit failed", { error });
		return c.json({ error: "feedback_unavailable" }, 503, NO_STORE);
	}
});

// Serves both the page's unsubscribe button and RFC 8058 one-click unsubscribe, which
// mail clients send as a form POST without cookies.
publicFeedbackRouter.post("/:token/unsubscribe", async (c) => {
	const token = c.req.param("token");
	if (!TOKEN_PATTERN.test(token)) return c.json({ error: "not_found" }, 404, NO_STORE);
	try {
		const { data, error } = await getDataClient(c.env).rpc("opt_out_of_product_emails", { p_token: token });
		if (error) throw error;
		if (!data) return c.json({ error: "not_found" }, 404, NO_STORE);
		return c.json({ unsubscribed: true }, 200, NO_STORE);
	} catch (error) {
		console.error("[web-api/feedback] unsubscribe failed", { error });
		return c.json({ error: "feedback_unavailable" }, 503, NO_STORE);
	}
});
