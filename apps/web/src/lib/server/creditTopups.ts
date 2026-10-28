import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { TOP_UP_CURRENCY } from "@/lib/server/topUpValidation";
import { normaliseCountryCode } from "@/lib/countryCodes";

// Credit top-ups started from the API or CLI (POST /v1/credits/topups in apps/api).
// A workspace owner or admin reviews them on /settings/credits/topups/{id}:
// * saved_card: Confirm charges the saved card as a customer-present payment (no off_session),
//   with the request id as the Stripe idempotency key, finishing 3D Secure on the same page.
// * checkout: the reviewer pays with a new card through the existing web checkout.
// The Stripe payment webhook credits the wallet (once per PaymentIntent) and records the
// outcome here with recordCreditTopupPaymentFromWebhook. Nothing on these paths acts on GET.

export type CreditTopupStatus = "pending" | "confirmed" | "declined" | "expired" | "paid" | "failed";

export type CreditTopupRow = {
	id: string;
	workspace_id: string;
	requested_by: string | null;
	flow: "checkout" | "saved_card";
	amount_cents: number;
	currency: string;
	payment_method_id: string | null;
	payment_method_brand: string | null;
	payment_method_last4: string | null;
	status: CreditTopupStatus;
	reason: string | null;
	stripe_payment_intent_id: string | null;
	stripe_checkout_session_id: string | null;
	expires_at: string;
	created_at: string;
	decided_at: string | null;
	paid_at: string | null;
};

export const CREDIT_TOPUP_COLUMNS =
	"id,workspace_id,requested_by,flow,amount_cents,currency,payment_method_id,payment_method_brand,payment_method_last4,status,reason,stripe_payment_intent_id,stripe_checkout_session_id,expires_at,created_at,decided_at,paid_at";

/** Metadata keys on the PaymentIntent (and Checkout Session) a top-up request creates. */
export const CREDIT_TOPUP_METADATA = {
	requestId: "topup_request_id",
	flow: "topup_flow",
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Minimal client shape so tests can pass a fake (the admin client satisfies it).
export type CreditTopupDb = {
	from: (table: string) => any;
	rpc: (fn: string, args: Record<string, unknown>) => any;
};

export function isCreditTopupId(value: unknown): value is string {
	return typeof value === "string" && UUID_PATTERN.test(value);
}

export function hashCreditTopupToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function formatTopupUsd(cents: number): string {
	return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function isTopupExpired(row: Pick<CreditTopupRow, "status" | "expires_at">, now = Date.now()): boolean {
	return row.status === "pending" && Date.parse(row.expires_at) <= now;
}

export type CreditTopupReview = {
	row: CreditTopupRow;
	workspaceName: string;
	requesterEmail: string | null;
	canDecide: boolean;
};

export async function reviewerAccess(db: CreditTopupDb, workspaceId: string, userId: string): Promise<{ canDecide: boolean; workspaceName: string }> {
	const [{ data: member }, { data: workspace }] = await Promise.all([
		db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
		db.from("workspaces").select("name,owner_user_id").eq("id", workspaceId).maybeSingle(),
	]);
	const role = String(member?.role ?? "").toLowerCase();
	return {
		canDecide: role === "owner" || role === "admin" || workspace?.owner_user_id === userId,
		workspaceName: String(workspace?.name ?? "").trim() || "Workspace",
	};
}

/**
 * Loads a request for the review page. Returns null when it does not exist; canDecide is
 * false unless the user is an owner or admin of the request's workspace. Read-only.
 */
export async function loadCreditTopupForReviewer(args: {
	db: CreditTopupDb;
	id: string;
	userId: string;
	lookupEmail: (userId: string) => Promise<string | null>;
}): Promise<CreditTopupReview | null> {
	if (!isCreditTopupId(args.id)) return null;
	const { data, error } = await args.db.from("credit_topup_requests").select(CREDIT_TOPUP_COLUMNS).eq("id", args.id.toLowerCase()).maybeSingle();
	if (error) throw error;
	if (!data) return null;
	const row = data as CreditTopupRow;
	const access = await reviewerAccess(args.db, row.workspace_id, args.userId);
	if (!access.canDecide) return { row, workspaceName: "", requesterEmail: null, canDecide: false };
	return {
		row,
		workspaceName: access.workspaceName,
		requesterEmail: row.requested_by ? await args.lookupEmail(row.requested_by) : null,
		canDecide: true,
	};
}

export type DecideResult =
	| { ok: true; status: CreditTopupStatus; reason: string | null; changed: boolean }
	| { ok: false; httpStatus: number; error: string };

export async function decideCreditTopup(args: {
	db: CreditTopupDb;
	id: string;
	token: string;
	userId: string;
	decision: "confirm" | "decline";
}): Promise<DecideResult> {
	if (!isCreditTopupId(args.id) || !args.token) return { ok: false, httpStatus: 404, error: "not_found" };
	const { data, error } = await args.db.rpc("decide_credit_topup_request", {
		p_request_id: args.id.toLowerCase(),
		p_confirm_token_hash: hashCreditTopupToken(args.token),
		p_user_id: args.userId,
		p_decision: args.decision,
	});
	if (error) {
		const message = String(error.message ?? "");
		if (message.includes("credit_topup_not_found")) return { ok: false, httpStatus: 404, error: "not_found" };
		if (message.includes("credit_topup_forbidden")) return { ok: false, httpStatus: 403, error: "forbidden" };
		throw error;
	}
	const row = (Array.isArray(data) ? data[0] : data) as { status?: CreditTopupStatus; reason?: string | null; changed?: boolean } | null;
	if (!row?.status) throw new Error("decide_credit_topup_request returned no status");
	return { ok: true, status: row.status, reason: row.reason ?? null, changed: row.changed === true };
}

/** True when the token matches the request's confirm link. Read-only. */
export async function creditTopupTokenMatches(db: CreditTopupDb, id: string, token: string): Promise<boolean> {
	if (!isCreditTopupId(id) || !token) return false;
	const { data, error } = await db.from("credit_topup_requests").select("confirm_token_hash").eq("id", id.toLowerCase()).maybeSingle();
	if (error) throw error;
	return typeof data?.confirm_token_hash === "string" && data.confirm_token_hash === hashCreditTopupToken(token);
}

/**
 * The purchase country every card top-up needs: a newly chosen one is saved on the user,
 * as the web checkout does; otherwise the one declared before. Null when there is none.
 */
export async function resolveTopupPurchaseCountry(db: CreditTopupDb, userId: string, requested: unknown): Promise<string | null> {
	const chosen = normaliseCountryCode(requested);
	if (chosen) {
		const { error } = await db
			.from("users")
			.update({ declared_country_code: chosen, country_declared_at: new Date().toISOString() })
			.eq("user_id", userId);
		if (error) throw error;
		return chosen;
	}
	const { data, error } = await db.from("users").select("declared_country_code").eq("user_id", userId).maybeSingle();
	if (error) throw error;
	return normaliseCountryCode(data?.declared_country_code);
}

export async function loadCreditTopup(db: CreditTopupDb, id: string): Promise<CreditTopupRow | null> {
	const { data, error } = await db.from("credit_topup_requests").select(CREDIT_TOPUP_COLUMNS).eq("id", id.toLowerCase()).maybeSingle();
	if (error) throw error;
	return (data ?? null) as CreditTopupRow | null;
}

export type ConfirmPaymentResult =
	| { state: "succeeded" | "processing" }
	| { state: "requires_action"; clientSecret: string }
	| { state: "failed"; reason: string };

function failureReason(source: { code?: string | null; decline_code?: string | null } | null | undefined): string {
	const code = source?.decline_code || source?.code || "";
	if (code === "authentication_required" || code === "payment_intent_authentication_failure") return "authentication_failed";
	if (code === "insufficient_funds" || code === "expired_card" || code === "incorrect_cvc") return code;
	if (code === "card_declined" || code === "generic_decline" || code === "do_not_honor") return "card_declined";
	return code ? code.slice(0, 64) : "payment_failed";
}

function resultFor(pi: Stripe.PaymentIntent): ConfirmPaymentResult {
	if (pi.status === "succeeded") return { state: "succeeded" };
	if (pi.status === "processing") return { state: "processing" };
	if (pi.status === "requires_action" && pi.client_secret) return { state: "requires_action", clientSecret: pi.client_secret };
	return { state: "failed", reason: failureReason(pi.last_payment_error) };
}

async function recordPayment(db: CreditTopupDb, row: CreditTopupRow, paymentIntentId: string, outcome: "paid" | "failed", reason?: string) {
	const { error } = await db.rpc("record_credit_topup_payment", {
		p_request_id: row.id,
		p_workspace_id: row.workspace_id,
		p_payment_intent_id: paymentIntentId,
		p_outcome: outcome,
		p_reason: reason ?? null,
	});
	if (error) throw error;
}

/**
 * Charges a confirmed saved_card request: one PaymentIntent per request (idempotency key =
 * request id, and the id is stored on the request so later attempts retrieve it instead of
 * creating another). Customer-present, so 3D Secure can run on the review page. Does not
 * credit: the payment webhook does.
 */
export async function chargeConfirmedCreditTopup(args: {
	db: CreditTopupDb;
	stripe: Stripe;
	row: CreditTopupRow;
	countryCode: string;
}): Promise<ConfirmPaymentResult> {
	const { db, stripe, row } = args;
	if (row.flow !== "saved_card" || !row.payment_method_id) throw new Error("credit_topup_not_saved_card");

	if (row.stripe_payment_intent_id) {
		return resultFor(await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id));
	}

	const { data: wallet, error: walletError } = await db.from("wallets").select("stripe_customer_id").eq("workspace_id", row.workspace_id).maybeSingle();
	if (walletError) throw walletError;
	const customerId = String(wallet?.stripe_customer_id ?? "").trim();
	if (!customerId) throw new Error("credit_topup_missing_customer");

	let pi: Stripe.PaymentIntent;
	try {
		pi = await stripe.paymentIntents.create(
			{
				amount: row.amount_cents,
				currency: TOP_UP_CURRENCY,
				customer: customerId,
				payment_method: row.payment_method_id,
				payment_method_types: ["card"],
				payment_method_options: { card: { request_three_d_secure: "automatic" } },
				confirm: true,
				description: "AI Credits top-up (API or CLI request)",
				metadata: {
					purpose: "top_up",
					workspace_id: row.workspace_id,
					country_code: args.countryCode,
					[CREDIT_TOPUP_METADATA.requestId]: row.id,
					[CREDIT_TOPUP_METADATA.flow]: "saved_card",
				},
			},
			{ idempotencyKey: row.id },
		);
	} catch (error) {
		// A synchronous decline still created the PaymentIntent; record it so the request ends.
		const stripeError = error as { type?: string; code?: string; decline_code?: string; payment_intent?: Stripe.PaymentIntent };
		if (stripeError?.type === "StripeCardError" && stripeError.payment_intent?.id) {
			const reason = failureReason(stripeError);
			await recordPayment(db, row, stripeError.payment_intent.id, "failed", reason);
			return { state: "failed", reason };
		}
		throw error;
	}

	const { error: attachError } = await db
		.from("credit_topup_requests")
		.update({ stripe_payment_intent_id: pi.id, updated_at: new Date().toISOString() })
		.eq("id", row.id)
		.is("stripe_payment_intent_id", null);
	if (attachError) throw attachError;

	const result = resultFor(pi);
	if (result.state === "failed") await recordPayment(db, row, pi.id, "failed", result.reason);
	return result;
}

/**
 * Called by the Stripe webhook for top-up PaymentIntents. paid: after the wallet was credited
 * (or the credit was already applied). failed: only for saved_card requests, since Checkout
 * lets the payer retry with another card in the same session.
 */
export async function recordCreditTopupPaymentFromWebhook(args: {
	db: CreditTopupDb;
	paymentIntent: Pick<Stripe.PaymentIntent, "id" | "metadata" | "last_payment_error">;
	outcome: "paid" | "failed";
}): Promise<"recorded" | "ignored" | "refused"> {
	const metadata = args.paymentIntent.metadata ?? {};
	const requestId = String(metadata[CREDIT_TOPUP_METADATA.requestId] ?? "").trim();
	const workspaceId = String(metadata.workspace_id ?? "").trim();
	if (!isCreditTopupId(requestId) || !workspaceId) return "ignored";
	if (args.outcome === "failed" && metadata[CREDIT_TOPUP_METADATA.flow] !== "saved_card") return "ignored";
	const { data, error } = await args.db.rpc("record_credit_topup_payment", {
		p_request_id: requestId,
		p_workspace_id: workspaceId,
		p_payment_intent_id: args.paymentIntent.id,
		p_outcome: args.outcome,
		p_reason: args.outcome === "failed" ? failureReason(args.paymentIntent.last_payment_error) : null,
	});
	if (error) throw error;
	if (data !== true) {
		// eslint-disable-next-line no-console
		console.warn("[credit-topups] PaymentIntent did not match its top-up request", {
			paymentIntentId: args.paymentIntent.id,
			requestId,
			outcome: args.outcome,
		});
		return "refused";
	}
	return "recorded";
}
