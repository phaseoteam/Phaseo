// Credit top-ups from the API and CLI: /v1/credits/topups.
//
// POST needs billing:write (never granted by default: OAuth callers opt in at login and
// management keys must list it) and workspace membership. Nothing is charged here:
// * No saved card (flow "checkout"): the response carries a Phaseo link. A signed-in owner or
//   admin opens it and pays with a new card through the web checkout (pay_and_save), which
//   saves the card for later top-ups.
// * Saved card (flow "saved_card"): every owner and admin is emailed a single-use link to a
//   review page; one of them confirms (or declines) the charge there.
// Either way the Stripe payment webhook credits the wallet, once per PaymentIntent, and
// marks the request paid. GET /{id} reports the status with a final flag and a reason code,
// so agents stop polling (and do not retry) on declined, expired or failed requests.
import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, isResponse, requireCapability, requireJsonBody, requireOAuthWorkspaceRole } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2026-04-22.dahlia";
const DEFAULT_WEB_BASE_URL = "https://phaseo.app";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same minimum as the web checkout (apps/web/src/lib/server/topUpValidation.ts). */
export const MIN_TOPUP_CENTS = 500;
/** Agent-started top-ups are capped lower than web checkout. */
export const MAX_TOPUP_CENTS = 50_000;
export const TOPUP_TTL_SECONDS = 30 * 60;
export const MAX_PENDING_TOPUPS = 5;

const TOPUP_COLUMNS =
	"id,workspace_id,flow,amount_cents,currency,payment_method_brand,payment_method_last4,status,reason,expires_at,created_at,decided_at,paid_at";

type TopupStatus = "pending" | "confirmed" | "declined" | "expired" | "paid" | "failed";
type TopupFlow = "checkout" | "saved_card";

export type TopupRow = {
	id: string;
	workspace_id: string;
	flow: TopupFlow;
	amount_cents: number;
	currency: string;
	payment_method_brand: string | null;
	payment_method_last4: string | null;
	status: TopupStatus;
	reason: string | null;
	expires_at: string;
	created_at: string;
	decided_at: string | null;
	paid_at: string | null;
};

type SavedCard = { id: string; brand: string | null; last4: string | null };

type TopupAuth = {
	workspaceId: string;
	userId?: string | null;
	authMethod?: "api_key" | "oauth";
	oauthClientId?: string | null;
	requestId?: string | null;
	scopes?: string[];
	oauthScopes?: string[];
};

function errorResponse(status: number, error: string, message: string, headers: Record<string, string> = {}) {
	return json({ ok: false, error, message }, status, { ...NO_STORE, ...headers });
}

/** Parses a USD amount with at most two decimals into cents, within the top-up limits. */
export function parseTopupAmount(value: unknown): { ok: true; cents: number } | { ok: false; error: string; message: string } {
	const amount = typeof value === "string" && value.trim() ? Number(value) : value;
	if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
		return { ok: false, error: "invalid_amount", message: "amount_usd must be a positive number of US dollars, for example 20 or 12.50" };
	}
	const cents = Math.round(amount * 100);
	if (Math.abs(amount * 100 - cents) > 1e-6) {
		return { ok: false, error: "invalid_amount", message: "amount_usd can have at most two decimal places" };
	}
	if (cents < MIN_TOPUP_CENTS) {
		return { ok: false, error: "amount_below_minimum", message: `The minimum top-up is ${formatUsd(MIN_TOPUP_CENTS)}` };
	}
	if (cents > MAX_TOPUP_CENTS) {
		return { ok: false, error: "amount_above_maximum", message: `The maximum top-up from the API or CLI is ${formatUsd(MAX_TOPUP_CENTS)}. Larger top-ups can be made in the dashboard.` };
	}
	return { ok: true, cents };
}

export function formatUsd(cents: number): string {
	return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isFinal(status: TopupStatus): boolean {
	return status === "paid" || status === "declined" || status === "expired" || status === "failed";
}

function statusMessage(row: Pick<TopupRow, "status" | "flow" | "reason">): string {
	switch (row.status) {
		case "pending":
			return row.flow === "checkout"
				? "Open checkout_url in a browser. A workspace owner or admin pays there with a new card, which is saved for later top-ups."
				: "Waiting for a workspace owner or admin to confirm the charge from the email Phaseo sent them.";
		case "confirmed":
			return "Confirmed. Waiting for the card payment to complete.";
		case "paid":
			return "Paid. Credits were added to the workspace.";
		case "declined":
			return "A workspace owner or admin declined this top-up. Do not retry it automatically; ask a person.";
		case "expired":
			return "Nobody completed this top-up within 30 minutes. Do not retry it automatically; ask a person.";
		case "failed":
			return `The payment failed (${row.reason ?? "payment_failed"}). Do not retry it automatically; ask a person to check the card.`;
	}
}

function webBaseUrl(): string {
	const configured = getBindings().PHASEO_WEB_BASE_URL?.trim();
	return (configured || DEFAULT_WEB_BASE_URL).replace(/\/+$/, "");
}

export function topupReviewUrl(id: string, token: string): string {
	return `${webBaseUrl()}/settings/credits/topups/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
}

export function formatTopup(row: TopupRow, extra: { checkoutUrl?: string | null; recipients?: number } = {}) {
	const pendingCheckout = row.status === "pending" && row.flow === "checkout";
	const awaitingConfirmation = row.status === "pending" && row.flow === "saved_card";
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		status: row.status,
		final: isFinal(row.status),
		reason: row.reason,
		message: statusMessage(row),
		flow: row.flow,
		amount_cents: row.amount_cents,
		amount_usd: row.amount_cents / 100,
		currency: row.currency,
		payment_method: row.payment_method_last4 || row.payment_method_brand
			? { brand: row.payment_method_brand, last4: row.payment_method_last4 }
			: null,
		checkout_url: pendingCheckout ? extra.checkoutUrl ?? null : null,
		next_action: pendingCheckout
			? "open_checkout_url"
			: awaitingConfirmation
				? "await_email_confirmation"
				: row.status === "confirmed"
					? "await_payment"
					: null,
		...(extra.recipients !== undefined ? { confirmation_recipients: extra.recipients } : {}),
		expires_at: row.expires_at,
		created_at: row.created_at,
		decided_at: row.decided_at,
		paid_at: row.paid_at,
	};
}

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function newConfirmToken(): string {
	return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashConfirmToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stripeSecretKey(): string | null {
	const bindings = getBindings();
	const live = bindings.STRIPE_SECRET_KEY?.trim();
	if (live) return live;
	return bindings.TEST_STRIPE_SECRET_KEY?.trim() || null;
}

async function stripeGet(secretKey: string, path: string): Promise<any> {
	const response = await fetch(`${STRIPE_API}/${path}`, {
		headers: { Authorization: `Bearer ${secretKey}`, "Stripe-Version": STRIPE_VERSION },
	});
	const body = await response.json().catch(() => null) as any;
	if (!response.ok) {
		throw new Error(String(body?.error?.message ?? `Stripe request failed with status ${response.status}`));
	}
	return body;
}

function cardFrom(method: any): SavedCard | null {
	if (!method || typeof method !== "object" || typeof method.id !== "string" || method.type !== "card") return null;
	return { id: method.id, brand: method.card?.brand ?? null, last4: method.card?.last4 ?? null };
}

/** The customer's default card, else its newest saved card, else null. */
export async function findSavedCard(secretKey: string, customerId: string): Promise<SavedCard | null> {
	const id = encodeURIComponent(customerId);
	const customer = await stripeGet(secretKey, `customers/${id}?expand[]=invoice_settings.default_payment_method`);
	if (!customer || customer.deleted) return null;
	const defaultCard = cardFrom(customer.invoice_settings?.default_payment_method);
	if (defaultCard) return defaultCard;
	const methods = await stripeGet(secretKey, `customers/${id}/payment_methods?type=card&limit=1`);
	return cardFrom(Array.isArray(methods?.data) ? methods.data[0] : null);
}

/** Owners and admins of the workspace (and its owner_user_id), with their emails. */
async function confirmationRecipients(workspaceId: string): Promise<{ workspaceName: string; recipients: Array<{ userId: string; email: string }> }> {
	const supabase = getSupabaseAdmin();
	const [{ data: workspace }, { data: members, error: membersError }] = await Promise.all([
		supabase.from("workspaces").select("name,owner_user_id").eq("id", workspaceId).maybeSingle(),
		supabase.from("workspace_members").select("user_id,role").eq("workspace_id", workspaceId).in("role", ["owner", "admin"]),
	]);
	if (membersError) throw membersError;
	const userIds = new Set<string>();
	for (const member of (members ?? []) as Array<{ user_id?: string | null }>) {
		const userId = String(member.user_id ?? "").trim();
		if (userId) userIds.add(userId);
	}
	const ownerUserId = String((workspace as any)?.owner_user_id ?? "").trim();
	if (ownerUserId) userIds.add(ownerUserId);

	const recipients: Array<{ userId: string; email: string }> = [];
	for (const userId of userIds) {
		const email = await userEmail(userId);
		if (email) recipients.push({ userId, email });
	}
	const name = String((workspace as any)?.name ?? "").trim();
	return { workspaceName: name || "your workspace", recipients };
}

async function userEmail(userId: string | null | undefined): Promise<string | null> {
	if (!userId) return null;
	try {
		const result = await (getSupabaseAdmin() as any).auth.admin.getUserById(userId);
		const email = String(result?.data?.user?.email ?? "").trim();
		return email || null;
	} catch {
		return null;
	}
}

async function authorize(req: Request, access: "create" | "read") {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const value = auth.value as TopupAuth;
	if (access === "create") {
		// Explicit even for management keys: a key with no scope list does not get billing:write.
		const scopeError = requireCapability(value, CAPABILITIES.BILLING_WRITE, { requireExplicitNonOAuthScope: true });
		if (scopeError) return { response: scopeError } as const;
	} else {
		const scopeError = requireCapability(value, CAPABILITIES.CREDITS_READ)
			&& requireCapability(value, CAPABILITIES.BILLING_WRITE, { requireExplicitNonOAuthScope: true });
		if (scopeError) return { response: scopeError } as const;
	}
	const roleError = await requireOAuthWorkspaceRole(value, value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return { response: roleError } as const;
	return { auth: value } as const;
}

function createErrorResponse(message: string): Response | null {
	if (message.includes("credit_topup_too_many_pending")) {
		return errorResponse(429, "too_many_pending_topups", `This workspace already has ${MAX_PENDING_TOPUPS} top-ups waiting. Wait for them to be confirmed, declined or expire (30 minutes).`, { "Retry-After": "300" });
	}
	if (message.includes("credit_topup_idempotency_conflict")) {
		return errorResponse(409, "idempotency_conflict", "This idempotency_key was already used for a different top-up.");
	}
	return null;
}

async function handleCreate(req: Request) {
	const authorized = await authorize(req, "create");
	if ("response" in authorized) return authorized.response;
	const { auth } = authorized;

	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;

	const requestedWorkspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
	if (requestedWorkspaceId && requestedWorkspaceId !== auth.workspaceId) {
		return errorResponse(403, "forbidden", "workspace_id must match the authenticated workspace");
	}
	const amount = parseTopupAmount(body.amount_usd);
	if (amount.ok === false) return errorResponse(400, amount.error, amount.message);

	const rawKey = typeof body.idempotency_key === "string" ? body.idempotency_key : req.headers.get("Idempotency-Key");
	const idempotencyKey = rawKey?.trim() || null;
	if (idempotencyKey && idempotencyKey.length > 255) {
		return errorResponse(400, "invalid_idempotency_key", "idempotency_key must be at most 255 characters");
	}

	const secretKey = stripeSecretKey();
	if (!secretKey) return errorResponse(503, "billing_unavailable", "Card payments are not configured on this deployment.");

	try {
		const supabase = getSupabaseAdmin();
		const { data: wallet, error: walletError } = await supabase
			.from("wallets")
			.select("stripe_customer_id")
			.eq("workspace_id", auth.workspaceId)
			.maybeSingle();
		if (walletError) throw walletError;
		const customerId = String((wallet as any)?.stripe_customer_id ?? "").trim();

		let card: SavedCard | null = null;
		if (customerId) {
			try {
				card = await findSavedCard(secretKey, customerId);
			} catch (error) {
				console.error("credit_topup_saved_card_lookup_failed", { workspace_id: auth.workspaceId, error: String((error as Error)?.message ?? error) });
				return errorResponse(502, "billing_unavailable", "Phaseo could not reach the payment provider. Try again shortly.");
			}
		}
		const flow: TopupFlow = card ? "saved_card" : "checkout";

		const confirmation = flow === "saved_card" ? await confirmationRecipients(auth.workspaceId) : null;
		if (confirmation && confirmation.recipients.length === 0) {
			return errorResponse(409, "no_confirmers", "No workspace owner or admin has an email address to confirm this top-up.");
		}

		const token = newConfirmToken();
		const tokenHash = await hashConfirmToken(token);
		const userId = auth.userId?.trim() || null;
		const { data: created, error: createError } = await supabase.rpc("create_credit_topup_request", {
			p_workspace_id: auth.workspaceId,
			p_requested_by: userId,
			p_requested_via: auth.authMethod === "oauth" ? "oauth" : "management_key",
			p_oauth_client_id: auth.authMethod === "oauth" ? auth.oauthClientId ?? null : null,
			p_flow: flow,
			p_amount_cents: amount.cents,
			p_payment_method_id: card?.id ?? null,
			p_payment_method_brand: card?.brand ?? null,
			p_payment_method_last4: card?.last4 ?? null,
			p_confirm_token_hash: tokenHash,
			p_idempotency_key: idempotencyKey,
			p_ttl_seconds: TOPUP_TTL_SECONDS,
			p_max_pending: MAX_PENDING_TOPUPS,
		});
		if (createError) {
			const mapped = createErrorResponse(String(createError.message ?? ""));
			if (mapped) return mapped;
			throw createError;
		}
		const createdRow = (Array.isArray(created) ? created[0] : created) as { request_id?: string; created?: boolean } | null;
		const requestId = String(createdRow?.request_id ?? "");
		if (!requestId) throw new Error("create_credit_topup_request returned no id");
		const isNew = createdRow?.created === true;

		const { data: row, error: rowError } = await supabase
			.from("credit_topup_requests")
			.select(TOPUP_COLUMNS)
			.eq("id", requestId)
			.eq("workspace_id", auth.workspaceId)
			.maybeSingle();
		if (rowError || !row) throw rowError ?? new Error("credit top-up request not found after create");
		const topup = row as unknown as TopupRow;

		let checkoutUrl: string | null = null;
		if (topup.flow === "checkout" && topup.status === "pending") {
			if (isNew) {
				checkoutUrl = topupReviewUrl(topup.id, token);
			} else {
				// A replay gets a fresh link; the earlier one stops working.
				const { error: rotateError } = await supabase
					.from("credit_topup_requests")
					.update({ confirm_token_hash: tokenHash, updated_at: new Date().toISOString() })
					.eq("id", topup.id)
					.eq("status", "pending");
				if (rotateError) throw rotateError;
				checkoutUrl = topupReviewUrl(topup.id, token);
			}
		}

		// The confirmation emails go out with the request. If enqueueing failed after the request
		// was created, a replay with the same idempotency key enqueues them (with a fresh link)
		// instead of leaving a pending request nobody was told about.
		let sendConfirmation = isNew;
		if (!isNew && topup.flow === "saved_card" && topup.status === "pending" && confirmation) {
			const { count, error: outboxReadError } = await supabase
				.from("email_outbox")
				.select("id", { count: "exact", head: true })
				.like("dedupe_key", `credit_topup_confirmation:${topup.id}:%`);
			if (outboxReadError) throw outboxReadError;
			if (!count) {
				const { error: rotateError } = await supabase
					.from("credit_topup_requests")
					.update({ confirm_token_hash: tokenHash, updated_at: new Date().toISOString() })
					.eq("id", topup.id)
					.eq("status", "pending");
				if (rotateError) throw rotateError;
				sendConfirmation = true;
			}
		}

		let recipients: number | undefined;
		if (sendConfirmation && topup.flow === "saved_card" && confirmation) {
			const requesterEmail = await userEmail(userId);
			const reviewUrl = topupReviewUrl(topup.id, token);
			const { error: outboxError } = await supabase.from("email_outbox").upsert(
				confirmation.recipients.map((recipient) => ({
					dedupe_key: `credit_topup_confirmation:${topup.id}:${recipient.userId}`,
					kind: "credit_topup_confirmation",
					template: "credit_topup_confirmation",
					to_email: recipient.email,
					subject: `Confirm ${formatUsd(topup.amount_cents)} of Phaseo credits`,
					workspace_id: auth.workspaceId,
					user_id: recipient.userId,
					payload: {
						request_id: topup.id,
						workspace_name: confirmation.workspaceName,
						amount_cents: topup.amount_cents,
						card_brand: topup.payment_method_brand,
						card_last4: topup.payment_method_last4,
						requested_by_email: requesterEmail,
						confirm_url: reviewUrl,
						expires_at: topup.expires_at,
					},
				})),
				{ onConflict: "dedupe_key", ignoreDuplicates: true },
			);
			if (outboxError) throw outboxError;
			recipients = confirmation.recipients.length;
		}

		if (isNew) {
			await recordWorkspaceAuditEvent(supabase as any, {
				workspaceId: auth.workspaceId,
				actorUserId: userId,
				action: "credit_topup.requested",
				targetType: "credit_topup_request",
				targetId: topup.id,
				targetName: formatUsd(topup.amount_cents),
				metadata: { flow: topup.flow, amount_cents: topup.amount_cents, auth_method: auth.authMethod ?? "api_key" },
				requestId: auth.requestId ?? null,
			});
		}

		return json({ ok: true, topup: formatTopup(topup, { checkoutUrl, recipients }) }, isNew ? 201 : 200, NO_STORE);
	} catch (error) {
		return internalServerError("credit_topups.create", error);
	}
}

async function handleGet(req: Request) {
	const authorized = await authorize(req, "read");
	if ("response" in authorized) return authorized.response;
	const { auth } = authorized;

	const match = new URL(req.url).pathname.match(/\/([^/]+)\/?$/);
	const id = match ? decodeURIComponent(match[1]).trim() : "";
	if (!UUID_PATTERN.test(id)) return errorResponse(400, "bad_request", "Top-up id must be a UUID");

	try {
		const supabase = getSupabaseAdmin();
		const load = () => supabase
			.from("credit_topup_requests")
			.select(TOPUP_COLUMNS)
			.eq("id", id.toLowerCase())
			.eq("workspace_id", auth.workspaceId)
			.maybeSingle();
		let { data, error } = await load();
		if (error) throw error;
		if (!data) return errorResponse(404, "not_found", "Top-up not found");
		let topup = data as unknown as TopupRow;
		if (topup.status === "pending" && Date.parse(topup.expires_at) <= Date.now()) {
			const { error: expireError } = await supabase
				.from("credit_topup_requests")
				.update({ status: "expired", reason: "expired", updated_at: new Date().toISOString() })
				.eq("id", topup.id)
				.eq("status", "pending")
				.lte("expires_at", new Date().toISOString());
			if (expireError) throw expireError;
			({ data, error } = await load());
			if (error || !data) throw error ?? new Error("credit top-up request disappeared");
			topup = data as unknown as TopupRow;
		}
		return json({ ok: true, topup: formatTopup(topup) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("credit_topups.get", error);
	}
}

export const creditTopupsRoutes = new Hono<Env>();

creditTopupsRoutes.post("/", withRuntime(handleCreate));
creditTopupsRoutes.get("/:id", withRuntime(handleGet));
