import type Stripe from "stripe";
import { getSandboxStripe, readStripeSandboxWorkspaceId } from "@/lib/stripe";
import { resolveConfiguredStripeCheckoutBaseUrl } from "@/lib/stripeCheckoutRedirects";
import { createAdminClient } from "@/utils/supabase/admin";
import { TOP_UP_CURRENCY } from "@/lib/server/topUpValidation";
import { getTranslations } from "@/i18n/server";

/** Fixed sandbox top-up: $10, charged in the Stripe sandbox only. */
export const SANDBOX_TOP_UP_CENTS = 1000;

/**
 * True when the admin sandbox checkout has everything it needs: a test-mode key, a webhook signing
 * secret and the sandbox workspace. CI writes "disabled" to both secrets when Infisical has none,
 * which fails these checks.
 */
export function isStripeSandboxConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
	const key = env.STRIPE_SANDBOX_SECRET_KEY?.trim() ?? "";
	const webhook = env.STRIPE_SANDBOX_WEBHOOK_SECRET?.trim() ?? "";
	return (key.startsWith("sk_test_") || key.startsWith("rk_test_")) && webhook.startsWith("whsec_") && Boolean(readStripeSandboxWorkspaceId(env));
}

/**
 * The sandbox workspace's Stripe customer, in the sandbox account. Its wallet stores a sandbox
 * customer id; when that is missing or unknown to the sandbox, a new sandbox customer is created.
 */
async function ensureSandboxCustomer(stripe: Stripe, workspaceId: string): Promise<string> {
	const admin = createAdminClient();
	const wallet = await admin.from("wallets").select("stripe_customer_id").eq("workspace_id", workspaceId).maybeSingle();
	if (wallet.error) throw wallet.error;
	const existing = typeof wallet.data?.stripe_customer_id === "string" ? wallet.data.stripe_customer_id.trim() : "";
	if (existing) {
		const customer = await stripe.customers.retrieve(existing).catch(() => null);
		if (customer && !("deleted" in customer && customer.deleted)) return existing;
	}
	const created = await stripe.customers.create(
		{ name: "Phaseo Stripe sandbox", metadata: { workspace_id: workspaceId, purpose: "stripe_sandbox" } },
		{ idempotencyKey: `stripe-sandbox-customer:${workspaceId}:${existing || "none"}` },
	);
	const saved = await admin.from("wallets").upsert({ workspace_id: workspaceId, stripe_customer_id: created.id }, { onConflict: "workspace_id" });
	if (saved.error) throw saved.error;
	return created.id;
}

/** Creates a sandbox Checkout Session that tops up the sandbox workspace and saves the card. */
export async function createStripeSandboxCheckout(): Promise<{ url: string; workspaceId: string }> {
	const workspaceId = readStripeSandboxWorkspaceId();
	if (!workspaceId) throw new Error("STRIPE_SANDBOX_WORKSPACE_ID is missing");
	const baseUrl = resolveConfiguredStripeCheckoutBaseUrl(process.env);
	if (!baseUrl) throw new Error("Checkout redirect base URL is not configured");
	const t = await getTranslations("SettingsUI");
	const stripe = getSandboxStripe();
	const customer = await ensureSandboxCustomer(stripe, workspaceId);
	const metadata = { purpose: "top_up", workspace_id: workspaceId, country_code: "GB", stripe_sandbox: "true" };
	const session = await stripe.checkout.sessions.create({
		mode: "payment",
		locale: "en",
		adaptive_pricing: { enabled: false },
		payment_method_types: ["card", "link"],
		customer,
		line_items: [{ quantity: 1, price_data: { currency: TOP_UP_CURRENCY, unit_amount: SANDBOX_TOP_UP_CENTS, product_data: { name: t("billingCopy.sandboxTest.productName") } } }],
		payment_intent_data: { setup_future_usage: "off_session", metadata },
		metadata,
		billing_address_collection: "required",
		customer_update: { address: "auto", name: "auto" },
		success_url: `${baseUrl}/settings/credits?stripe_sandbox=success`,
		cancel_url: `${baseUrl}/settings/credits?stripe_sandbox=cancelled`,
	});
	if (!session.url) throw new Error("Stripe sandbox returned no checkout URL");
	return { url: session.url, workspaceId };
}
