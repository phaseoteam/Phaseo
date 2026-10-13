import { getBindings, getSupabaseAdmin } from "@/runtime/env";

// Feedback request emails go out once per user, 90 days after sign-up, signed personally
// and sent from a real reply-to address. The database picks who to ask and queues the
// outbox rows (enqueue_feedback_request_emails); this module renders them.

export const FEEDBACK_REQUEST_MIN_ACCOUNT_AGE_DAYS = 90;
const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_CAMPAIGN = "v1";
const DEFAULT_WEB_BASE_URL = "https://phaseo.app";

type Segment = "never_requested" | "used_not_paid" | "paid";
type Recency = "active" | "lapsed" | "dormant";

export type FeedbackRequestEmail = {
	subject: string;
	html: string;
	text: string;
	from: string;
	replyTo: string;
	headers: Record<string, string>;
};

const SUBJECTS: Record<Segment, string> = {
	never_requested: "Quick question about Phaseo",
	used_not_paid: "Quick question about Phaseo",
	paid: "Can I ask what you think of Phaseo?",
};

const OPENINGS: Record<Recency, string> = {
	active: "Thanks for using Phaseo recently.",
	lapsed: "You haven't been on Phaseo for a while, so I wanted to check in.",
	dormant: "You signed up for Phaseo (you may know us as AI Stats) a while ago, and a lot has changed since.",
};

const QUESTIONS: Record<Segment, string> = {
	never_requested:
		"I'd really like to know what stopped you getting started. Was setup unclear, was a model missing, or was it just bad timing? An honest answer helps me more than anything.",
	used_not_paid:
		"I'd really like to know why you didn't end up adding credits. Whether it was pricing, setup, a missing model or just timing, an honest answer helps me more than anything.",
	paid:
		"Thank you for being a customer. I'd love to hear what you like, what annoys you, and what you'd want next.",
};

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\"", "&quot;")
		.replaceAll("'", "&#39;");
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function rewardUsd(raw: string | undefined): number {
	const value = Number(raw ?? "1");
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatUsd(value: number): string {
	return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

export function renderFeedbackRequestEmail(payload: Record<string, unknown>): FeedbackRequestEmail {
	const bindings = getBindings();
	const from = bindings.FEEDBACK_REQUEST_FROM_EMAIL?.trim();
	// Never fall back to the noreply sender: the point of this email is that people reply.
	if (!from) throw new Error("missing_feedback_request_from_email");
	const token = typeof payload.token === "string" ? payload.token : "";
	if (!/^[0-9a-f-]{36}$/i.test(token)) throw new Error("invalid_feedback_request_token");

	const segment = oneOf<Segment>(payload.segment, ["never_requested", "used_not_paid", "paid"], "never_requested");
	const recency = oneOf<Recency>(payload.recency, ["active", "lapsed", "dormant"], "dormant");
	const firstName = typeof payload.first_name === "string" && payload.first_name.trim() ? payload.first_name.trim() : "there";
	const baseUrl = (bindings.PHASEO_WEB_BASE_URL?.trim() || DEFAULT_WEB_BASE_URL).replace(/\/+$/, "");
	const feedbackUrl = `${baseUrl}/feedback/${token}`;
	const unsubscribeUrl = `${baseUrl}/feedback/${token}/unsubscribe`;
	const oneClickUnsubscribeUrl = `${baseUrl}/api/_web/feedback/${token}/unsubscribe`;
	const reward = rewardUsd(bindings.FEEDBACK_REWARD_USD);
	const rewardLine = reward > 0
		? `As a small thank-you, you'll get ${formatUsd(reward)} of Phaseo credit for answering, whatever you say (while this round's thank-you budget lasts).`
		: null;

	const paragraphs = [
		`${OPENINGS[recency]} I'm Daniel, and I build Phaseo.`,
		QUESTIONS[segment],
		"Just hit reply, or answer a couple of quick questions here:",
	];
	const footer = "You're getting this because you have a Phaseo account. Don't want emails like this?";

	const p = (content: string) => `<p style="margin: 0 0 14px;">${content}</p>`;
	const html = [
		"<div style=\"font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.55; color: #111;\">",
		p(`Hi ${escapeHtml(firstName)},`),
		...paragraphs.slice(0, 2).map((text) => p(escapeHtml(text))),
		p(`${escapeHtml(paragraphs[2])} <a href="${escapeHtml(feedbackUrl)}">${escapeHtml(feedbackUrl)}</a>`),
		...(rewardLine ? [p(escapeHtml(rewardLine))] : []),
		p("Thanks,<br>Daniel<br>Phaseo"),
		`<p style="margin: 24px 0 0; font-size: 12px; color: #666;">${escapeHtml(footer)} <a href="${escapeHtml(unsubscribeUrl)}" style="color: #666;">Unsubscribe</a></p>`,
		"</div>",
	].join("");

	const text = [
		`Hi ${firstName},`,
		"",
		paragraphs[0],
		"",
		paragraphs[1],
		"",
		`${paragraphs[2]} ${feedbackUrl}`,
		...(rewardLine ? ["", rewardLine] : []),
		"",
		"Thanks,",
		"Daniel",
		"Phaseo",
		"",
		`${footer} Unsubscribe: ${unsubscribeUrl}`,
	].join("\n");

	return {
		subject: SUBJECTS[segment],
		html,
		text,
		from,
		replyTo: bindings.FEEDBACK_REQUEST_REPLY_TO_EMAIL?.trim() || from,
		headers: {
			"List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
	};
}

/** Daily job: queue today's feedback requests. Returns how many were queued. */
export async function enqueueFeedbackRequestEmails(): Promise<number> {
	const bindings = getBindings();
	const limit = Number.parseInt(bindings.FEEDBACK_REQUEST_DAILY_LIMIT ?? "", 10);
	const campaign = bindings.FEEDBACK_REQUEST_CAMPAIGN?.trim() || DEFAULT_CAMPAIGN;
	const { data, error } = await getSupabaseAdmin().rpc("enqueue_feedback_request_emails", {
		p_campaign: campaign,
		p_min_account_age_days: FEEDBACK_REQUEST_MIN_ACCOUNT_AGE_DAYS,
		p_limit: Number.isFinite(limit) && limit >= 0 ? limit : DEFAULT_DAILY_LIMIT,
	});
	if (error) throw new Error(`feedback_request_enqueue_error:${error.message ?? "unknown"}`);
	return typeof data === "number" ? data : 0;
}
