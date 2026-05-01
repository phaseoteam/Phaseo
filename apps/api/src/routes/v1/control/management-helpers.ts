import { getBindings, getSupabaseAdmin } from "@/runtime/env";

const TOP_UP_LEDGER_KINDS = ["top_up", "top_up_one_off", "auto_top_up"] as const;
const SUCCESS_PAYMENT_STATUSES = ["Succeeded", "succeeded", "paid", "Paid"] as const;
const DEFAULT_KEY_LIMIT = 100;

export const CHAT_MANAGED_KEY_NAME = "__chat_route_managed_key__";

export function getWorkspaceKeyLimit(): number {
	const bindings = getBindings();
	const raw = Number.parseInt(
		String(
			(bindings as any).WORKSPACE_KEY_LIMIT ??
				(bindings as any).NON_ENTERPRISE_KEY_LIMIT ??
				"",
		),
		10,
	);
	if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_KEY_LIMIT;
	return raw;
}

export async function userHasPaidWorkspaceAccess(userId: string): Promise<boolean> {
	const admin = getSupabaseAdmin();
	const { data: memberships, error: membershipsError } = await admin
		.from("workspace_members")
		.select("workspace_id, role")
		.eq("user_id", userId);
	if (membershipsError) {
		throw new Error(membershipsError.message || "Failed to load workspace memberships");
	}

	const adminWorkspaceIds = Array.from(
		new Set(
			(memberships ?? [])
				.filter((row: any) => {
					const role = String(row?.role ?? "").toLowerCase();
					return role === "owner" || role === "admin";
				})
				.map((row: any) => String(row?.workspace_id ?? ""))
				.filter(Boolean),
		),
	);
	if (!adminWorkspaceIds.length) return false;

	const { count, error } = await admin
		.from("credit_ledger")
		.select("id", { count: "exact", head: true })
		.in("workspace_id", adminWorkspaceIds)
		.in("kind", [...TOP_UP_LEDGER_KINDS])
		.in("status", [...SUCCESS_PAYMENT_STATUSES])
		.gt("amount_nanos", 0);
	if (error) {
		throw new Error(error.message || "Failed to load credit ledger state");
	}
	return (count ?? 0) > 0;
}

export async function enforceWorkspaceKeyLimit(workspaceId: string): Promise<void> {
	const admin = getSupabaseAdmin();
	const keyLimit = getWorkspaceKeyLimit();

	const [
		{ count: apiKeyCount, error: apiKeyCountError },
		{ count: managementKeyCount, error: managementKeyCountError },
	] = await Promise.all([
		admin
			.from("keys")
			.select("id", { count: "exact", head: true })
			.eq("workspace_id", workspaceId)
			.neq("status", "deleted")
			.neq("name", CHAT_MANAGED_KEY_NAME),
		admin
			.from("management_keys")
			.select("id", { count: "exact", head: true })
			.eq("workspace_id", workspaceId),
	]);

	if (apiKeyCountError) {
		throw new Error(apiKeyCountError.message || "Failed to count workspace API keys");
	}
	if (managementKeyCountError) {
		throw new Error(managementKeyCountError.message || "Failed to count workspace management keys");
	}

	const totalKeys = (apiKeyCount ?? 0) + (managementKeyCount ?? 0);
	if (totalKeys >= keyLimit) {
		throw new Error(`Key limit reached (${keyLimit}) for this workspace. Delete an existing key to create a new one.`);
	}
}

async function createStripeCustomer(args: {
	workspaceId: string;
	userId: string;
	email?: string | null;
	name?: string | null;
}) {
	const bindings = getBindings();
	const secretKey =
		typeof bindings.STRIPE_SECRET_KEY === "string" && bindings.STRIPE_SECRET_KEY.trim()
			? bindings.STRIPE_SECRET_KEY.trim()
			: typeof bindings.TEST_STRIPE_SECRET_KEY === "string" && bindings.TEST_STRIPE_SECRET_KEY.trim()
				? bindings.TEST_STRIPE_SECRET_KEY.trim()
				: "";
	if (!secretKey) return null;

	const form = new URLSearchParams();
	if (args.email?.trim()) form.set("email", args.email.trim());
	if (args.name?.trim()) form.set("name", args.name.trim());
	form.set("metadata[workspace_id]", args.workspaceId);
	form.set("metadata[user_id]", args.userId);

	const response = await fetch("https://api.stripe.com/v1/customers", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${secretKey}`,
			"Content-Type": "application/x-www-form-urlencoded",
			"Idempotency-Key": `workspace:${args.workspaceId}`,
			"Stripe-Version": "2026-04-22.dahlia",
		},
		body: form.toString(),
	});

	let payload: any = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}
	if (!response.ok) {
		throw new Error(
			String(payload?.error?.message ?? `Stripe customer creation failed with status ${response.status}`),
		);
	}
	const customerId = String(payload?.id ?? "").trim();
	if (!customerId) {
		throw new Error("Stripe customer creation returned no id");
	}
	return customerId;
}

export async function ensureWorkspaceWalletProvisioned(args: {
	workspaceId: string;
	userId: string;
	email?: string | null;
	name?: string | null;
}) {
	const admin = getSupabaseAdmin();
	const { data: existing, error: existingError } = await admin
		.from("wallets")
		.select("workspace_id, stripe_customer_id")
		.eq("workspace_id", args.workspaceId)
		.maybeSingle();
	if (existingError) {
		throw new Error(existingError.message || "Failed to load workspace wallet");
	}
	if (existing?.workspace_id && existing?.stripe_customer_id) {
		return { workspaceId: args.workspaceId, customerId: String(existing.stripe_customer_id) };
	}

	const customerId = await createStripeCustomer(args);
	if (!customerId) {
		throw new Error("Stripe customer provisioning is not configured for workspace creation");
	}
	const payload = { workspace_id: args.workspaceId, stripe_customer_id: customerId };
	const { error: upsertError } = await admin
		.from("wallets")
		.upsert(payload, { onConflict: "workspace_id", ignoreDuplicates: false });
	if (upsertError) {
		throw new Error(upsertError.message || "Failed to provision workspace wallet");
	}

	return { workspaceId: args.workspaceId, customerId };
}
