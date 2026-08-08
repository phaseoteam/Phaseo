import Stripe from "stripe";

import { getBindings, getSupabaseAdmin } from "@/runtime/env";

type OwnerContact = {
	email: string;
	userId: string;
	workspaceName: string;
};

function stripeClient(): Stripe {
	const bindings = getBindings();
	const key = bindings.STRIPE_SECRET_KEY ?? bindings.TEST_STRIPE_SECRET_KEY;
	if (!key?.trim()) throw new Error("missing_stripe_secret_key");
	return new Stripe(key, { apiVersion: "2026-04-22.dahlia" as any });
}

async function resolveOwnerContact(workspaceId: string): Promise<OwnerContact | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspaces")
		.select("name,owner_user_id")
		.eq("id", workspaceId)
		.maybeSingle();
	if (error || !data?.owner_user_id) return null;
	const user = await (supabase as any).auth.admin.getUserById(data.owner_user_id).catch(() => null);
	const email = String(user?.data?.user?.email ?? "").trim();
	if (!email) return null;
	return {
		email,
		userId: String(data.owner_user_id),
		workspaceName: String(data.name ?? "your workspace"),
	};
}

async function enqueueUnique(row: Record<string, unknown>): Promise<boolean> {
	const { error } = await getSupabaseAdmin()
		.from("email_outbox")
		.upsert(row as any, { onConflict: "dedupe_key", ignoreDuplicates: true });
	if (error) throw new Error(`billing_email_enqueue_failed:${error.message ?? "unknown"}`);
	return true;
}

export async function enqueueAutoTopUpFailedEmail(args: {
	workspaceId: string;
	dedupeId: string;
	reason?: string | null;
}): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const { data: settings, error } = await supabase
		.from("workspace_settings")
		.select("auto_top_up_failure_email_enabled")
		.eq("workspace_id", args.workspaceId)
		.maybeSingle();
	if (error || settings?.auto_top_up_failure_email_enabled === false) return false;
	const owner = await resolveOwnerContact(args.workspaceId);
	if (!owner) return false;
	const dedupeId = args.dedupeId.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 180);
	return enqueueUnique({
		dedupe_key: `auto_top_up_failed:${dedupeId}`,
		kind: "auto_top_up_failed",
		template: "auto_top_up_failed",
		to_email: owner.email,
		subject: "Auto Top-Up failed",
		workspace_id: args.workspaceId,
		user_id: owner.userId,
		payload: {
			workspace_name: owner.workspaceName,
			reason: String(args.reason ?? "The saved payment method could not be charged.").slice(0, 500),
		},
	});
}

export function cardExpiresWithinDays(args: {
	expMonth: number;
	expYear: number;
	now: Date;
	days: number;
}): boolean {
	if (!Number.isInteger(args.expMonth) || args.expMonth < 1 || args.expMonth > 12) return false;
	if (!Number.isInteger(args.expYear) || args.expYear < 2000) return false;
	const expiresAt = Date.UTC(args.expYear, args.expMonth, 1);
	const remainingMs = expiresAt - args.now.getTime();
	return remainingMs > 0 && remainingMs <= args.days * 24 * 60 * 60 * 1000;
}

export async function runPaymentMethodExpiryNotificationJob(args: {
	now?: Date;
	pageSize?: number;
} = {}): Promise<{ checked: number; enqueued: number; failed: number }> {
	const now = args.now ?? new Date();
	const pageSize = Math.max(1, Math.min(500, Math.trunc(args.pageSize ?? 100)));
	const supabase = getSupabaseAdmin();
	const stripe = stripeClient();
	let checked = 0;
	let enqueued = 0;
	let failed = 0;
	let offset = 0;

	while (true) {
		const { data: wallets, error: walletError } = await supabase
			.from("wallets")
			.select("workspace_id,stripe_customer_id")
			.not("stripe_customer_id", "is", null)
			.order("workspace_id", { ascending: true })
			.range(offset, offset + pageSize - 1);
		if (walletError) throw new Error(`payment_method_expiry_wallets_failed:${walletError.message}`);
		if (!wallets?.length) break;

		const workspaceIds = wallets.map((row) => String(row.workspace_id));
		const { data: settings, error: settingsError } = await supabase
			.from("workspace_settings")
			.select("workspace_id,payment_method_expiring_email_enabled")
			.in("workspace_id", workspaceIds);
		if (settingsError) throw new Error(`payment_method_expiry_settings_failed:${settingsError.message}`);
		const disabled = new Set(
			(settings ?? [])
				.filter((row) => row.payment_method_expiring_email_enabled === false)
				.map((row) => String(row.workspace_id)),
		);

		for (const wallet of wallets) {
			const workspaceId = String(wallet.workspace_id);
			if (disabled.has(workspaceId)) continue;
			try {
				const methods = await stripe.paymentMethods.list({ customer: String(wallet.stripe_customer_id), type: "card", limit: 100 });
				const owner = await resolveOwnerContact(workspaceId);
				if (!owner) continue;
				for (const method of methods.data) {
					checked += 1;
					const card = method.card;
					if (!card || !cardExpiresWithinDays({ expMonth: card.exp_month, expYear: card.exp_year, now, days: 30 })) continue;
					await enqueueUnique({
						dedupe_key: `payment_method_expiring:${workspaceId}:${method.id}:${card.exp_year}-${card.exp_month}`,
						kind: "payment_method_expiring",
						template: "payment_method_expiring",
						to_email: owner.email,
						subject: "Payment method expiring soon",
						workspace_id: workspaceId,
						user_id: owner.userId,
						payload: {
							workspace_name: owner.workspaceName,
							brand: card.display_brand ?? card.brand,
							last4: card.last4,
							expiry: `${String(card.exp_month).padStart(2, "0")}/${card.exp_year}`,
						},
					});
					enqueued += 1;
				}
			} catch (error) {
				failed += 1;
				console.error("payment_method_expiry_workspace_failed", { workspaceId, error });
			}
		}

		if (wallets.length < pageSize) break;
		offset += pageSize;
	}
	return { checked, enqueued, failed };
}
