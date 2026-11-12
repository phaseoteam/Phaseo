import { Hono } from "hono";
import { unsubscribeResendContact } from "@/auth/resendContacts";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";

// Public routes behind the links in feedback request emails. The unguessable access
// token in the URL is the only credential: it reads and answers one request, and opts
// its user out of non-essential email. Answers go to a PostHog API survey; the database
// only records that the request was answered and the thank-you code.
export const publicFeedbackRouter = new Hono<{ Bindings: Env }>();

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER_LENGTH = 3_000;
const REWARD_VALID_DAYS = 90;
const POSTHOG_TIMEOUT_MS = 5_000;

// PostHog project 81404, survey "90-day feedback email". Each question id is the
// survey's; reason choices must match the survey's choice labels exactly.
export const FEEDBACK_SURVEY = {
	id: "01a1643c-cf2b-0000-c901-471b37014811",
	name: "90-day feedback email",
	questions: [
		{ key: "reason", id: "a97019d0-ada5-4610-ab95-31d5f81b3147", question: "What stopped you getting started or adding credits?" },
		{ key: "details", id: "f84989b9-6ae1-4685-8b06-0754e34acb21", question: "Tell us more" },
		{ key: "nps", id: "63b6d996-8146-4412-b165-0eacd9e0ea09", question: "How likely are you to recommend Phaseo to a friend or colleague?" },
		{ key: "likes", id: "b1a02605-4bbf-4728-8441-daf4a4dcaee3", question: "What do you like most?" },
		{ key: "improve", id: "c5a47c5b-b18f-48b6-996f-e619619ec0e1", question: "What should we improve or add?" },
	],
} as const;

const REASON_CHOICES: Record<string, string> = {
	setup_unclear: "Setup was unclear",
	pricing_unclear: "Pricing was unclear",
	model_missing: "The model I wanted wasn't available",
	model_choice_unclear: "I wasn't sure which model to use",
	payment_issue: "I had a problem paying",
	chose_alternative: "I chose another tool",
	just_exploring: "I was just exploring",
	not_ready_yet: "I'm not ready yet",
	other: "Something else",
};

const TEXT_ANSWERS = ["details", "likes", "improve"] as const;

export type FeedbackAnswers = {
	reason?: string;
	details?: string;
	nps?: number;
	likes?: string;
	improve?: string;
};

/**
 * Accepts the feedback page's answers: a known reason or a 0-10 score, plus optional
 * short text. Unknown keys and anything else are rejected.
 */
export function parseFeedbackAnswers(value: unknown): FeedbackAnswers | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	const known = new Set<string>(FEEDBACK_SURVEY.questions.map((question) => question.key));
	if (Object.keys(raw).some((key) => !known.has(key))) return null;

	const answers: FeedbackAnswers = {};
	if (raw.reason !== undefined) {
		if (typeof raw.reason !== "string" || !Object.hasOwn(REASON_CHOICES, raw.reason)) return null;
		answers.reason = raw.reason;
	}
	if (raw.nps !== undefined) {
		if (!Number.isInteger(raw.nps) || (raw.nps as number) < 0 || (raw.nps as number) > 10) return null;
		answers.nps = raw.nps as number;
	}
	for (const key of TEXT_ANSWERS) {
		const input = raw[key];
		if (input === undefined) continue;
		if (typeof input !== "string") return null;
		const text = input.trim();
		if (text.length > MAX_ANSWER_LENGTH) return null;
		if (text) answers[key] = text;
	}
	return answers.reason !== undefined || answers.nps !== undefined ? answers : null;
}

type FeedbackRequestRecord = {
	requestId: string;
	userId: string;
	campaign: string;
	segment: string;
	recency: string;
	responded: boolean;
	rewardCode: string | null;
};

/** The "survey sent" event posthog-js would send for these answers, as the account's user. */
export function feedbackSurveyEvent(request: FeedbackRequestRecord, answers: FeedbackAnswers) {
	// PostHog survey responses are text: the reason as its choice label, the score as "0"-"10".
	const responses: Record<string, string | undefined> = {
		...answers,
		reason: answers.reason === undefined ? undefined : REASON_CHOICES[answers.reason],
		nps: answers.nps === undefined ? undefined : String(answers.nps),
	};
	const properties: Record<string, unknown> = {
		$survey_id: FEEDBACK_SURVEY.id,
		$survey_name: FEEDBACK_SURVEY.name,
		$survey_submission_id: request.requestId,
		$survey_completed: true,
		$survey_questions: FEEDBACK_SURVEY.questions.map((question) => ({
			id: question.id,
			question: question.question,
			response: responses[question.key] ?? null,
		})),
		campaign: request.campaign,
		segment: request.segment,
		recency: request.recency,
		source: "feedback_email",
	};
	FEEDBACK_SURVEY.questions.forEach((question, index) => {
		const response = responses[question.key];
		if (response === undefined) return;
		properties[`$survey_response_${question.id}`] = response;
		properties[index === 0 ? "$survey_response" : `$survey_response_${index}`] = response;
	});
	// The request id doubles as the event uuid, so a retry after a database failure is
	// deduplicated by PostHog instead of counted twice.
	return { event: "survey sent", distinct_id: request.userId, uuid: request.requestId, properties };
}

async function sendFeedbackToPostHog(env: Env, request: FeedbackRequestRecord, answers: FeedbackAnswers): Promise<void> {
	const apiKey = env.POSTHOG_PROJECT_API_KEY?.trim();
	if (!apiKey) throw new Error("posthog_not_configured");
	const host = (env.POSTHOG_HOST?.trim() || "https://eu.i.posthog.com").replace(/\/+$/, "");
	const response = await fetch(`${host}/i/v0/e/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ api_key: apiKey, ...feedbackSurveyEvent(request, answers) }),
		signal: AbortSignal.timeout(POSTHOG_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`posthog_capture_failed:${response.status}`);
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
		// The ids are only for the PostHog answer event; the page never needs them.
		const { rewardsIssued, requestId: _requestId, userId: _userId, ...request } = data as Record<string, unknown> & {
			rewardsIssued?: unknown;
		};
		const reward = rewardSettings(c.env);
		const rewardAvailable = reward.nanos > 0 && Number(rewardsIssued ?? 0) < reward.cap;
		return c.json({ ...request, rewardAvailable }, 200, NO_STORE);
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
	const client = getDataClient(c.env);
	try {
		const { data: found, error: lookupError } = await client.rpc("get_feedback_request", { p_token: token });
		if (lookupError) throw lookupError;
		if (!found) return c.json({ error: "not_found" }, 404, NO_STORE);
		const request = found as FeedbackRequestRecord;
		if (request.responded) {
			return c.json({ status: "already_submitted", rewardStatus: null, rewardCode: request.rewardCode ?? null }, 200, NO_STORE);
		}

		// The answers must reach PostHog before the request is marked answered and a code
		// is issued; if PostHog fails, nothing is recorded and the user can send again.
		await sendFeedbackToPostHog(c.env, request, answers);

		const { data, error } = await client.rpc("submit_feedback_response", {
			p_token: token,
			p_reward_nanos: reward.nanos,
			p_reward_cap: reward.cap,
			p_reward_valid_days: REWARD_VALID_DAYS,
		});
		if (error) throw error;
		const result = (data ?? {}) as { status?: string; rewardStatus?: string; rewardCode?: string | null };
		if (result.status === "not_found") return c.json({ error: "not_found" }, 404, NO_STORE);
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
// mail clients send as a form POST without cookies. The database opt-out lands first and
// stops feedback email; the addresses are then unsubscribed in Resend so its broadcasts
// and automations stop too. If Resend fails the request errors and can safely be repeated.
publicFeedbackRouter.post("/:token/unsubscribe", async (c) => {
	const token = c.req.param("token");
	if (!TOKEN_PATTERN.test(token)) return c.json({ error: "not_found" }, 404, NO_STORE);
	try {
		const { data, error } = await getDataClient(c.env).rpc("opt_out_of_product_emails", { p_token: token });
		if (error) throw error;
		if (!data) return c.json({ error: "not_found" }, 404, NO_STORE);
		const emails = (data as { emails?: unknown }).emails;
		for (const email of Array.isArray(emails) ? emails : []) {
			if (typeof email === "string") await unsubscribeResendContact(c.env, email);
		}
		return c.json({ unsubscribed: true }, 200, NO_STORE);
	} catch (error) {
		console.error("[web-api/feedback] unsubscribe failed", { error });
		return c.json({ error: "feedback_unavailable" }, 503, NO_STORE);
	}
});
