import { getBindings, getSupabaseAdmin } from "@/runtime/env";

// Low-balance emails, off the request path. Every five minutes the scheduled job runs
// public.sweep_low_balance_emails, which compares each wallet with the workspace's
// low_balance_email_threshold_nanos and queues one low_balance email_outbox row per drop (at most
// every six hours, never while auto top-up is working), with the same recipient, subject and
// payload the gateway used to write after a charge. The armed/unarmed rules are those of the
// low-balance push (sweep_low_balance_pushes), and the two share the auto top-up test.
// With Resend automations on, the sweep writes the rows as sent and this job sends the
// workspace.low_balance event for each one; otherwise the email outbox drain sends them.

const RESEND_LOW_BALANCE_EVENT_NAME = "workspace.low_balance";

export function isResendOnboardingAutomationsEnabled(): boolean {
	const bindings = getBindings();
	const apiKey = String(bindings.RESEND_API_KEY ?? "").trim();
	if (!apiKey) return false;
	const raw = String(bindings.RESEND_ONBOARDING_AUTOMATIONS_ENABLED ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return true;
	return ["1", "true", "yes", "on"].includes(raw);
}

async function sendLowBalanceAutomationEvent(args: {
	email: string;
	firstName: string;
	workspaceId: string;
	workspaceName: string;
	balanceNanos: number;
	balanceUsd: number;
	thresholdNanos: number;
	thresholdUsd: number;
	triggeredAt: Date;
}): Promise<void> {
	const bindings = getBindings();
	const apiKey = String(bindings.RESEND_API_KEY ?? "").trim();
	if (!apiKey) {
		throw new Error("missing_resend_api_key");
	}

	const payload = {
		firstName: args.firstName || "there",
		workspaceId: args.workspaceId,
		workspaceName: args.workspaceName,
		balanceNanos: args.balanceNanos,
		balanceUsd: args.balanceUsd,
		thresholdNanos: args.thresholdNanos,
		thresholdUsd: args.thresholdUsd,
		triggeredAtIso: args.triggeredAt.toISOString(),
	};

	let attempt = 0;
	while (attempt < 3) {
		attempt += 1;
		const response = await fetch("https://api.resend.com/events", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				event: RESEND_LOW_BALANCE_EVENT_NAME,
				email: args.email,
				payload,
			}),
		});

		if (response.ok) return;
		if (response.status === 429 && attempt < 3) {
			await new Promise((resolve) => {
				setTimeout(resolve, attempt * 300);
			});
			continue;
		}

		let detail = "";
		try {
			detail = await response.text();
		} catch {
			detail = "";
		}
		throw new Error(
			`resend_event_error:${response.status}:${detail || response.statusText || "unknown"}`,
		);
	}
}

export type LowBalanceEmail = {
	id: string;
	workspaceId: string;
	toEmail: string;
	firstName: string;
	teamName: string;
	balanceNanos: number;
	balanceUsd: number;
	thresholdNanos: number;
	thresholdUsd: number;
};

export type LowBalanceEmailSweepSummary = {
	skipped: boolean;
	watched: number;
	firstSeen: number;
	dropped: number;
	rearmed: number;
	coveredByTopUp: number;
	waiting: number;
	emailed: number;
	emails: LowBalanceEmail[];
	/** Resend automation events sent / failed (only when the sweep marked the rows sent). */
	automationSent: number;
	automationFailed: number;
};

const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value : fallback);

export function parseLowBalanceEmailSweep(data: unknown): LowBalanceEmailSweepSummary {
	const result = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const emails = (Array.isArray(result.emails) ? result.emails : []) as Array<Record<string, unknown>>;
	return {
		skipped: result.skipped === true,
		watched: count(result.watched),
		firstSeen: count(result.firstSeen),
		dropped: count(result.dropped),
		rearmed: count(result.rearmed),
		coveredByTopUp: count(result.coveredByTopUp),
		waiting: count(result.waiting),
		emailed: count(result.emailed),
		emails: emails.map((email) => ({
			id: String(email.id ?? ""),
			workspaceId: String(email.workspace_id ?? ""),
			toEmail: String(email.to_email ?? ""),
			firstName: text(email.user_first_name, "there"),
			teamName: text(email.team_name, "your team"),
			balanceNanos: count(email.balance_nanos),
			balanceUsd: count(email.balance_usd),
			thresholdNanos: count(email.threshold_nanos),
			thresholdUsd: count(email.threshold_usd),
		})),
		automationSent: 0,
		automationFailed: 0,
	};
}

/** True when a sweep did anything worth a log line. */
export function hasLowBalanceEmailActivity(summary: LowBalanceEmailSweepSummary): boolean {
	return summary.emailed > 0 || summary.dropped > 0 || summary.rearmed > 0 || summary.automationFailed > 0 || summary.skipped;
}

export async function runLowBalanceEmailSweep(options: { now?: Date } = {}): Promise<LowBalanceEmailSweepSummary> {
	const now = options.now ?? new Date();
	const automation = isResendOnboardingAutomationsEnabled();
	const { data, error } = await getSupabaseAdmin().rpc("sweep_low_balance_emails", {
		p_now: now.toISOString(),
		p_mark_sent: automation,
	});
	if (error) throw new Error(`low_balance_email_sweep_failed:${error.message}`);
	const summary = parseLowBalanceEmailSweep(data);
	if (!automation) return summary;
	// The rows are already marked sent: the Resend automation delivers the email.
	for (const email of summary.emails) {
		try {
			await sendLowBalanceAutomationEvent({
				email: email.toEmail,
				firstName: email.firstName,
				workspaceId: email.workspaceId,
				workspaceName: email.teamName,
				balanceNanos: email.balanceNanos,
				balanceUsd: email.balanceUsd,
				thresholdNanos: email.thresholdNanos,
				thresholdUsd: email.thresholdUsd,
				triggeredAt: now,
			});
			summary.automationSent += 1;
		} catch (error) {
			summary.automationFailed += 1;
			console.error("[low-balance] automation event failed", {
				workspaceId: email.workspaceId,
				outboxId: email.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return summary;
}
