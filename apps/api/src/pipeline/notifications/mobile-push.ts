import { getSupabaseAdmin } from "@/runtime/env";

// Rule-based mobile push for the Phaseo app. The database does the work: it turns catalogue
// history into notification events (capture_catalogue_notification_events), matches each event
// against users' rules and categories and queues it per device (enqueue_mobile_push_deliveries),
// and hands out due pushes under a claim token, one per device and group with the text already
// written (claim_mobile_push_deliveries). This job only moves pushes between the database and Expo.

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
// The only channel of app builds on channel scheme 1. From scheme 2 the app has one channel per
// category instead, and deletes this one.
export const MOBILE_PUSH_LEGACY_CHANNEL_ID = "model-updates";
const MOBILE_PUSH_CHANNEL_IDS = new Set([
	"new-models",
	"prices-providers",
	"deprecations",
	"money",
	"traffic",
	"security",
	"jobs",
	"account",
	"digest",
	"tests",
]);
// Expo accepts at most 100 messages per send request.
const EXPO_SEND_BATCH_SIZE = 100;
// Expo accepts up to 1,000 receipt ids per request; stay well under it.
const EXPO_RECEIPT_BATCH_SIZE = 300;
const EXPO_TIMEOUT_MS = 30_000;
const CAPTURE_LIMIT = 2_000;
// A transaction touching more models than this is a bulk sync or backfill, not news.
const BULK_TRANSACTION_MODELS = 20;
const EVENT_PAGE_SIZE = 50;
const MAX_FANOUT_PASSES = 10;
const MAX_SEND_BATCHES = 10;
// Expo ticket errors that no retry can fix.
const TERMINAL_EXPO_ERRORS = new Set(["DeviceNotRegistered", "MessageTooBig"]);

// One push as claim_mobile_push_deliveries returns it. A grouped push carries `deliveries` rows
// and counts `group_count` items, including those already sent to the device today.
export type ClaimedMobilePush = {
	id: string;
	attempts: number;
	expo_push_token: string;
	channel_scheme: number;
	kind: string;
	category: string | null;
	model_slug: string | null;
	title: string;
	body: string;
	href: string;
	group_key: string | null;
	group_count: number | null;
	tag: string | null;
	deliveries: number;
};

type ExpoTicket =
	| { status: "ok"; id?: string }
	| { status: "error"; message?: string; details?: { error?: string } };

type ExpoReceipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

export type MobilePushResult = {
	id: string;
	status: "sent" | "failed" | "retry";
	ticketId?: string;
	errorCode?: string;
	errorMessage?: string;
};

export type MobilePushSummary = {
	captured: number;
	skippedTransactions: number;
	events: number;
	queued: number;
	deferred: number;
	suppressed: number;
	claimed: number;
	// Deliveries carried by another delivery's push for the same device and group, not sent on their own.
	grouped: number;
	sent: number;
	retrying: number;
	failed: number;
	invalidated: number;
	receipts: number;
	// Receipts claimed but not returned by Expo this run; they are asked for again later.
	receiptsPending: number;
	receiptErrors: number;
	receiptError: string | null;
};

function emptySummary(): MobilePushSummary {
	return {
		captured: 0,
		skippedTransactions: 0,
		events: 0,
		queued: 0,
		deferred: 0,
		suppressed: 0,
		claimed: 0,
		grouped: 0,
		sent: 0,
		retrying: 0,
		failed: 0,
		invalidated: 0,
		receipts: 0,
		receiptsPending: 0,
		receiptErrors: 0,
		receiptError: null,
	};
}

export function hasMobilePushActivity(summary: MobilePushSummary): boolean {
	return Object.entries(summary).some(([key, value]) => key === "receiptError" ? Boolean(value) : Number(value) > 0);
}

function count(value: unknown): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function expoHeaders(accessToken?: string): Record<string, string> {
	const token = accessToken?.trim();
	return {
		accept: "application/json",
		"content-type": "application/json",
		...(token ? { authorization: `Bearer ${token}` } : {}),
	};
}

// A push whose channel the device lacks is not shown, so only apps on channel scheme 2 or later
// are sent to a category channel; older builds get their single channel.
export function mobilePushChannelId(category: string | null | undefined, channelScheme: number | null | undefined): string {
	if (!(Number(channelScheme) >= 2)) return MOBILE_PUSH_LEGACY_CHANNEL_ID;
	return category && MOBILE_PUSH_CHANNEL_IDS.has(category) ? category : "new-models";
}

export function buildMobilePushMessage(push: ClaimedMobilePush) {
	return {
		to: push.expo_push_token,
		title: push.title,
		body: push.body,
		data: {
			href: push.href,
			kind: push.kind,
			category: push.category,
			modelId: push.model_slug,
			group: push.group_key ? { key: push.group_key, count: count(push.group_count) || 1 } : null,
		},
		channelId: mobilePushChannelId(push.category, push.channel_scheme),
		sound: null,
		// A later push for the group the same day updates the shown one in place: Android replaces by
		// tag, iOS by collapseId (which on Android only merges pushes still in transit).
		...(push.tag ? { tag: push.tag, collapseId: push.tag } : {}),
	};
}

export async function sendExpoPushMessages(messages: unknown[], accessToken?: string): Promise<ExpoTicket[]> {
	const response = await fetch(EXPO_PUSH_SEND_URL, {
		method: "POST",
		headers: expoHeaders(accessToken),
		body: JSON.stringify(messages),
		signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`expo_push_http_${response.status}`);
	const payload = record(await response.json().catch(() => null));
	const tickets = payload.data;
	if (!Array.isArray(tickets) || tickets.length !== messages.length) {
		const errors = Array.isArray(payload.errors) ? payload.errors as Array<{ code?: unknown }> : [];
		throw new Error(typeof errors[0]?.code === "string" ? errors[0].code : "expo_push_invalid_response");
	}
	return tickets as ExpoTicket[];
}

async function fetchExpoReceipts(ticketIds: string[], accessToken?: string): Promise<Record<string, ExpoReceipt>> {
	const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
		method: "POST",
		headers: expoHeaders(accessToken),
		body: JSON.stringify({ ids: ticketIds }),
		signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`expo_receipts_http_${response.status}`);
	const payload = record(await response.json().catch(() => null));
	return record(payload.data) as Record<string, ExpoReceipt>;
}

export function ticketResult(id: string, ticket: ExpoTicket | undefined): MobilePushResult {
	if (ticket?.status === "ok") return ticket.id ? { id, status: "sent", ticketId: ticket.id } : { id, status: "sent" };
	const errorCode = (ticket?.status === "error" && ticket.details?.error) || "expo_push_error";
	return {
		id,
		status: TERMINAL_EXPO_ERRORS.has(errorCode) ? "failed" : "retry",
		errorCode,
		...(ticket?.status === "error" && ticket.message ? { errorMessage: ticket.message.slice(0, 1_000) } : {}),
	};
}

export type MobilePushReceiptResult =
	| { id: string; status: "ok" }
	| { id: string; status: "error"; errorCode: string; errorMessage?: string };

// A receipt Expo has not returned yet (or at all) produces nothing, which leaves it to be
// asked for again.
export function receiptResult(id: string, receipt: ExpoReceipt | undefined): MobilePushReceiptResult[] {
	if (receipt?.status === "ok") return [{ id, status: "ok" }];
	if (receipt?.status !== "error") return [];
	return [{
		id,
		status: "error",
		errorCode: receipt.details?.error ?? "receipt_error",
		...(receipt.message ? { errorMessage: receipt.message.slice(0, 1_000) } : {}),
	}];
}

async function sendClaimedPushes(pushes: ClaimedMobilePush[], accessToken?: string): Promise<MobilePushResult[]> {
	try {
		const tickets = await sendExpoPushMessages(pushes.map(buildMobilePushMessage), accessToken);
		return pushes.map((push, index) => ticketResult(push.id, tickets[index]));
	} catch (error) {
		// A failed request says nothing about the devices: retry every push in it.
		const errorCode = (error instanceof Error ? error.message : String(error)).slice(0, 100) || "expo_push_failed";
		return pushes.map((push) => ({ id: push.id, status: "retry", errorCode }));
	}
}

export async function runMobilePushJob(options: { accessToken?: string } = {}): Promise<MobilePushSummary> {
	const supabase = getSupabaseAdmin();
	const summary = emptySummary();

	const capture = await supabase.rpc("capture_catalogue_notification_events", {
		p_limit: CAPTURE_LIMIT,
		p_max_models_per_transaction: BULK_TRANSACTION_MODELS,
	});
	if (capture.error) throw new Error(`mobile_push_capture_failed:${capture.error.message}`);
	summary.captured = count(record(capture.data).emitted);
	summary.skippedTransactions = count(record(capture.data).skippedTransactions);

	// Fanning out closes an event, so every pass reads the oldest open events from the start.
	for (let pass = 0; pass < MAX_FANOUT_PASSES; pass += 1) {
		const events = await supabase
			.from("catalogue_notification_events")
			.select("id")
			.is("fanned_out_at", null)
			.order("created_at", { ascending: true })
			.order("id", { ascending: true })
			.limit(EVENT_PAGE_SIZE);
		if (events.error) throw new Error(`mobile_push_events_fetch_failed:${events.error.message}`);
		const rows = (events.data ?? []) as Array<{ id: string }>;
		for (const event of rows) {
			const fanned = await supabase.rpc("enqueue_mobile_push_deliveries", { p_event_id: event.id });
			if (fanned.error) throw new Error(`mobile_push_enqueue_failed:${fanned.error.message}`);
			const result = record(fanned.data);
			summary.events += 1;
			summary.queued += count(result.queued);
			summary.deferred += count(result.deferred);
			summary.suppressed += count(result.suppressed);
		}
		if (rows.length < EVENT_PAGE_SIZE) break;
	}

	for (let batch = 0; batch < MAX_SEND_BATCHES; batch += 1) {
		const claimToken = crypto.randomUUID();
		const claimed = await supabase.rpc("claim_mobile_push_deliveries", { p_limit: EXPO_SEND_BATCH_SIZE, p_claim_token: claimToken });
		if (claimed.error) throw new Error(`mobile_push_claim_failed:${claimed.error.message}`);
		const pushes = (Array.isArray(claimed.data) ? claimed.data : []) as ClaimedMobilePush[];
		if (pushes.length === 0) break;
		summary.claimed += pushes.length;
		summary.grouped += pushes.reduce((total, push) => total + Math.max(0, count(push.deliveries) - 1), 0);

		const results = await sendClaimedPushes(pushes, options.accessToken);
		const completed = await supabase.rpc("complete_mobile_push_deliveries", { p_claim_token: claimToken, p_results: results });
		if (completed.error) throw new Error(`mobile_push_complete_failed:${completed.error.message}`);
		const outcome = record(completed.data);
		summary.sent += count(outcome.sent);
		summary.retrying += count(outcome.retrying);
		summary.failed += count(outcome.failed);
		summary.invalidated += count(outcome.invalidated);
		if (pushes.length < EXPO_SEND_BATCH_SIZE) break;
	}

	// Receipts are best effort: a failed check never fails the run. Only the receipts Expo
	// returns are recorded; the claim on the rest lapses, so a failed request or a receipt that
	// is not ready yet is asked for again on a later run, for up to a day.
	const receipts = await supabase.rpc("claim_mobile_push_receipts", { p_limit: EXPO_RECEIPT_BATCH_SIZE });
	if (receipts.error) throw new Error(`mobile_push_receipts_claim_failed:${receipts.error.message}`);
	const tickets = (Array.isArray(receipts.data) ? receipts.data : []) as Array<{ id: string; expo_ticket_id: string }>;
	if (tickets.length > 0) {
		summary.receipts = tickets.length;
		summary.receiptsPending = tickets.length;
		try {
			const byTicket = await fetchExpoReceipts(tickets.map((ticket) => ticket.expo_ticket_id), options.accessToken);
			const results = tickets.flatMap((ticket) => receiptResult(ticket.id, byTicket[ticket.expo_ticket_id]));
			if (results.length > 0) {
				const recorded = await supabase.rpc("record_mobile_push_receipts", { p_results: results });
				if (recorded.error) throw new Error(`mobile_push_receipts_record_failed:${recorded.error.message}`);
				summary.receiptsPending = tickets.length - results.length;
				summary.receiptErrors = count(record(recorded.data).failed);
				summary.invalidated += count(record(recorded.data).invalidated);
			}
		} catch (error) {
			summary.receiptError = (error instanceof Error ? error.message : String(error)).slice(0, 200);
		}
	}

	return summary;
}
