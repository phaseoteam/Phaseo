import Stripe from "stripe";
import type { AccountWorkspaceContext } from "@/routes/account/context";
import type { Env } from "@/env";

export function getStripe(env: Env) {
	const key = env.STRIPE_SECRET_KEY?.trim() || env.TEST_STRIPE_SECRET_KEY?.trim();
	if (!key) throw new Error("stripe_secret_missing");
	return new Stripe(key, {
		apiVersion: "2026-04-22.dahlia",
		httpClient: Stripe.createFetchHttpClient(globalThis.fetch),
	});
}

export function activeStripeCustomer(
	value: Stripe.Customer | Stripe.DeletedCustomer,
): Stripe.Customer | null {
	return "deleted" in value && value.deleted ? null : value as Stripe.Customer;
}

function displayName(context: AccountWorkspaceContext): string | undefined {
	const metadata = context.user.userMetadata;
	const value = metadata.full_name ?? metadata.name;
	if (typeof value === "string" && value.trim()) return value.trim();
	return context.user.email?.split("@")[0]?.trim() || undefined;
}

function isMissingCustomer(error: unknown) {
	if (!error || typeof error !== "object") return false;
	const value = error as { code?: string; param?: string; message?: string; raw?: { code?: string; param?: string; message?: string } };
	const code = String(value.code ?? value.raw?.code ?? "");
	const param = String(value.param ?? value.raw?.param ?? "");
	const message = String(value.message ?? value.raw?.message ?? "");
	return code === "resource_missing" && (param === "customer" || param === "id" || message.includes("No such customer"));
}

export async function ensureWorkspaceStripeCustomer(
	env: Env,
	context: AccountWorkspaceContext,
): Promise<string> {
	const walletResult = await context.client.from("wallets")
		.select("workspace_id,stripe_customer_id")
		.eq("workspace_id", context.workspaceId).maybeSingle();
	if (walletResult.error) throw walletResult.error;
	const stripe = getStripe(env);
	const storedId = String(walletResult.data?.stripe_customer_id ?? "").trim();
	if (storedId) {
		try {
			const customer = activeStripeCustomer(await stripe.customers.retrieve(storedId));
			if (customer) {
				const boundWorkspace = String(customer.metadata?.workspace_id ?? "").trim();
				if (!boundWorkspace || boundWorkspace === context.workspaceId) return storedId;
			}
		} catch (error) {
			if (!isMissingCustomer(error)) throw error;
		}
	}

	let customerId: string | null = null;
	try {
		const search = await stripe.customers.search({
			query: `metadata['workspace_id']:'${context.workspaceId}'`,
			limit: 1,
		});
		customerId = search.data[0]?.id ?? null;
	} catch {
		// Email matching and creation below are the compatibility fallback.
	}
	if (!customerId && context.user.email) {
		const list = await stripe.customers.list({ email: context.user.email, limit: 1 });
		customerId = list.data[0]?.id ?? null;
		if (customerId) {
			await stripe.customers.update(customerId, {
				metadata: { workspace_id: context.workspaceId, user_id: context.user.id },
			});
		}
	}
	if (!customerId) {
		const created = await stripe.customers.create({
			email: context.user.email ?? undefined,
			name: displayName(context),
			metadata: { workspace_id: context.workspaceId, user_id: context.user.id },
		});
		customerId = created.id;
	}
	const upsertResult = await context.client.from("wallets").upsert(
		{ workspace_id: context.workspaceId, stripe_customer_id: customerId },
		{ onConflict: "workspace_id", ignoreDuplicates: false },
	);
	if (upsertResult.error) throw upsertResult.error;
	return customerId;
}
