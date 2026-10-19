import { getSupabaseAdmin } from "@/runtime/env";
import { mobilePushChannelId, sendExpoPushMessages, ticketResult, type MobilePushResult } from "./mobile-push";

// The weekly "Your Phaseo week" push. The database does the work: claim_mobile_push_digests finds
// the users one of whose devices has reached 18:00 on Sunday in its own time zone, sums their week
// over every workspace they own or administer, writes the text once per user and ISO week, queues
// it for each of their devices (after quiet hours where they apply), and hands out the due pushes
// under a claim token. This job only moves them to Expo and records the results through
// complete_mobile_push_deliveries, like any other push. Digests never count against the daily cap.

export const MOBILE_PUSH_DIGEST_KIND = "weekly_summary";
export const MOBILE_PUSH_DIGEST_CATEGORY = "digest";
// Expo accepts at most 100 messages per send request.
const DIGEST_BATCH_SIZE = 100;
const MAX_DIGEST_BATCHES = 10;

// One push as claim_mobile_push_digests returns it.
export type ClaimedMobilePushDigest = {
	id: string;
	attempts: number;
	expoPushToken: string;
	channelScheme: number;
	title: string;
	body: string;
	href: string;
	tag: string;
	isoWeek: string;
	workspaceId: string | null;
	workspaceName: string | null;
};

export type MobilePushDigestSummary = {
	// Digests written this run, and users whose week had nothing to report.
	built: number;
	skipped: number;
	// Pushes queued for now, and held until quiet hours end.
	queued: number;
	deferred: number;
	// Queued pushes closed instead of sent: too old, device gone, or push or the digest switched off.
	closed: number;
	claimed: number;
	sent: number;
	retrying: number;
	failed: number;
	invalidated: number;
};

function emptySummary(): MobilePushDigestSummary {
	return { built: 0, skipped: 0, queued: 0, deferred: 0, closed: 0, claimed: 0, sent: 0, retrying: 0, failed: 0, invalidated: 0 };
}

export function hasMobilePushDigestActivity(summary: MobilePushDigestSummary | null | undefined): boolean {
	return Boolean(summary) && Object.values(summary as MobilePushDigestSummary).some((value) => Number(value) > 0);
}

function count(value: unknown): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// A digest becomes due at 18:00 on Sunday in each device's time zone: from 04:00 UTC on Sunday
// (UTC+14) until 06:00 UTC on Monday (UTC-12), and is written until 06:00 local on Monday (18:00
// UTC). Quiet hours can hold a push for up to a day after that, and retries take under an hour.
// Outside Sunday to Tuesday UTC there is nothing to do, so the job makes no query at all.
export function isMobilePushDigestWindow(now: Date): boolean {
	const day = now.getUTCDay();
	return day === 0 || day === 1 || day === 2;
}

export function buildMobilePushDigestMessage(push: ClaimedMobilePushDigest) {
	return {
		to: push.expoPushToken,
		title: push.title,
		body: push.body,
		// Text only: no image, so no spend or personal data ever goes into a URL.
		data: {
			href: push.href,
			kind: MOBILE_PUSH_DIGEST_KIND,
			category: MOBILE_PUSH_DIGEST_CATEGORY,
			modelId: null,
			group: null,
			workspaceId: push.workspaceId ?? null,
			workspaceName: push.workspaceName ?? null,
		},
		channelId: mobilePushChannelId(MOBILE_PUSH_DIGEST_CATEGORY, push.channelScheme),
		sound: null,
		// One digest a week: a resend replaces the shown notification.
		tag: push.tag,
	};
}

async function sendDigestPushes(pushes: ClaimedMobilePushDigest[], accessToken?: string): Promise<MobilePushResult[]> {
	try {
		const tickets = await sendExpoPushMessages(pushes.map(buildMobilePushDigestMessage), accessToken);
		return pushes.map((push, index) => ticketResult(push.id, tickets[index]));
	} catch (error) {
		// A failed request says nothing about the devices: retry every push in it.
		const errorCode = (error instanceof Error ? error.message : String(error)).slice(0, 100) || "expo_push_failed";
		return pushes.map((push) => ({ id: push.id, status: "retry", errorCode }));
	}
}

export async function runMobilePushDigestJob(options: { accessToken?: string; now?: Date } = {}): Promise<MobilePushDigestSummary> {
	const summary = emptySummary();
	if (!isMobilePushDigestWindow(options.now ?? new Date())) return summary;
	const supabase = getSupabaseAdmin();

	for (let batch = 0; batch < MAX_DIGEST_BATCHES; batch += 1) {
		const claimToken = crypto.randomUUID();
		const claimed = await supabase.rpc("claim_mobile_push_digests", { p_limit: DIGEST_BATCH_SIZE, p_claim_token: claimToken });
		if (claimed.error) throw new Error(`mobile_push_digest_claim_failed:${claimed.error.message}`);
		const result = record(claimed.data);
		summary.built += count(result.built);
		summary.skipped += count(result.skipped);
		summary.queued += count(result.queued);
		summary.deferred += count(result.deferred);
		summary.closed += count(result.closed);
		const pushes = (Array.isArray(result.pushes) ? result.pushes : []) as ClaimedMobilePushDigest[];

		if (pushes.length > 0) {
			summary.claimed += pushes.length;
			const results = await sendDigestPushes(pushes, options.accessToken);
			const completed = await supabase.rpc("complete_mobile_push_deliveries", { p_claim_token: claimToken, p_results: results });
			if (completed.error) throw new Error(`mobile_push_digest_complete_failed:${completed.error.message}`);
			const outcome = record(completed.data);
			summary.sent += count(outcome.sent);
			summary.retrying += count(outcome.retrying);
			summary.failed += count(outcome.failed);
			summary.invalidated += count(outcome.invalidated);
		}
		// Go round again only while a full batch was due or more users are waiting to be written.
		if (pushes.length < DIGEST_BATCH_SIZE && result.more !== true) break;
	}
	return summary;
}
