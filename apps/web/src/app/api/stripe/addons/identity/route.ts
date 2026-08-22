import { NextResponse } from "next/server";
import { IDENTITY_ADDON_KEY, isWorkspaceAddonActive } from "@/lib/billing/identityAddon";
import { ENTERPRISE_PRICING_VERSION, enterpriseQuoteOptions, normalizeEnterpriseQuestionnaire, stripePriceIdForEnterprisePlan, type EnterprisePlanVariant } from "@/lib/billing/enterprisePricing";
import { readBoundedTextBody } from "@/lib/server/boundedRequestBody";
import { getStripe } from "@/lib/stripe";
import { requireActiveWorkspaceBillingAdmin, requireActiveWorkspaceStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";

const SETTINGS_PATH = "/settings/workspaces/settings";

function settingsUrl(request: Request, result?: string) {
	const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
	const url = new URL(SETTINGS_PATH, base);
	if (result) url.searchParams.set("identity", result);
	return url.toString();
}

async function currentSubscription(workspaceId: string) {
	const { data, error } = await createAdminClient()
		.from("workspace_addon_subscriptions")
		.select("status,current_period_end,cancel_at_period_end,grace_until,metadata,provider_subscription_id,plan_key,pricing_version,included_members,fee_policy,included_card_top_up_nanos")
		.eq("workspace_id", workspaceId)
		.eq("addon_key", IDENTITY_ADDON_KEY)
		.maybeSingle();
	if (error) throw error;
	return data;
}

export async function GET() {
	try {
		const { workspaceId } = await requireActiveWorkspaceBillingAdmin();
		const subscription = await currentSubscription(workspaceId);
		const periodStart = new Date();
		periodStart.setUTCDate(1);
		periodStart.setUTCHours(0, 0, 0, 0);
		const { data: decisions, error: decisionsError } = await createAdminClient()
			.from("workspace_top_up_fee_decisions")
			.select("gross_nanos")
			.eq("workspace_id", workspaceId)
			.eq("period_start", periodStart.toISOString().slice(0, 10))
			.eq("fee_waived", true)
			.neq("payment_rail", "bank_transfer");
		if (decisionsError) throw decisionsError;
		const usedNanos = (decisions ?? []).reduce((total, row) => total + Number(row.gross_nanos ?? 0), 0);
		return NextResponse.json({
			active: isWorkspaceAddonActive(subscription),
			status: subscription?.status ?? "not_subscribed",
			cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
			currentPeriodEnd: subscription?.current_period_end ?? null,
			grandfathered: subscription?.metadata?.grandfathered === true,
			planKey: subscription?.plan_key ?? null,
			pricingVersion: subscription?.pricing_version ?? null,
			includedMembers: subscription?.included_members ?? null,
			feePolicy: subscription?.fee_policy ?? null,
			includedCardTopUpUsd: Number(subscription?.included_card_top_up_nanos ?? 0) / 1_000_000_000,
			remainingCardTopUpUsd: Math.max(0, Number(subscription?.included_card_top_up_nanos ?? 0) - usedNanos) / 1_000_000_000,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status = message === "unauthorized" ? 401 : message === "missing_team" ? 400 : 503;
		return NextResponse.json({ error: message }, { status });
	}
}

export async function POST(request: Request) {
	try {
		const { workspaceId, customerId } = await requireActiveWorkspaceStripeCustomer({
			createIfMissing: true,
		});
		const existing = await currentSubscription(workspaceId);
		if (isWorkspaceAddonActive(existing)) {
			return NextResponse.json({ error: "Identity is already active" }, { status: 409 });
		}
		const bodyResult = await readBoundedTextBody(request, 8_192);
		if (!bodyResult.ok) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
		const body = JSON.parse(bodyResult.text || "{}");
		const quoteId = String(body.quoteId ?? "").trim();
		const selectedVariant = String(body.variant ?? "") as EnterprisePlanVariant;
		if (!quoteId || (selectedVariant !== "core" && selectedVariant !== "included_payments")) {
			return NextResponse.json({ error: "A valid quote and plan are required" }, { status: 400 });
		}
		const admin = createAdminClient();
		const { data: quoteRow, error: quoteError } = await admin
			.from("workspace_enterprise_quotes")
			.select("*")
			.eq("id", quoteId)
			.eq("workspace_id", workspaceId)
			.is("consumed_at", null)
			.gt("expires_at", new Date().toISOString())
			.maybeSingle();
		if (quoteError) throw quoteError;
		if (!quoteRow || quoteRow.pricing_version !== ENTERPRISE_PRICING_VERSION) {
			return NextResponse.json({ error: "This quote has expired. Please calculate a new one." }, { status: 409 });
		}
		const questionnaire = normalizeEnterpriseQuestionnaire(quoteRow.questionnaire ?? {});
		const calculated = enterpriseQuoteOptions(questionnaire);
		const option = calculated.options.find((candidate) => candidate.variant === selectedVariant);
		if (!option || calculated.tier.key !== quoteRow.tier_key) return NextResponse.json({ error: "Quote no longer matches pricing" }, { status: 409 });
		const priceId = stripePriceIdForEnterprisePlan(option.planKey);
		if (!priceId) return NextResponse.json({ error: "Enterprise billing is not configured for this plan" }, { status: 503 });
		const stripe = getStripe();
		const stripePrice = await stripe.prices.retrieve(priceId);
		if (!stripePrice.active || stripePrice.currency !== "usd" || stripePrice.unit_amount !== option.monthlyUsd * 100 || stripePrice.recurring?.interval !== "month") {
			return NextResponse.json({ error: "Enterprise price configuration does not match the quoted plan" }, { status: 503 });
		}
		const metadata = {
			workspace_id: workspaceId,
			addon_key: IDENTITY_ADDON_KEY,
			quote_id: quoteId,
			plan_key: option.planKey,
			pricing_version: ENTERPRISE_PRICING_VERSION,
			included_members: String(option.includedMembers),
			fee_policy: option.feePolicy,
			included_card_top_up_nanos: String(option.includedCardTopUpUsd * 1_000_000_000),
		};

		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			customer: customerId,
			line_items: [{ price: priceId, quantity: 1 }],
			allow_promotion_codes: false,
			billing_address_collection: "required",
			success_url: settingsUrl(request, "success"),
			cancel_url: settingsUrl(request, "canceled"),
			metadata,
			subscription_data: {
				metadata,
			},
		});
		const { error: updateError } = await admin.from("workspace_enterprise_quotes").update({
			selected_variant: selectedVariant,
			plan_key: option.planKey,
			monthly_price_cents: option.monthlyUsd * 100,
			included_members: option.includedMembers,
			included_card_top_up_nanos: option.includedCardTopUpUsd * 1_000_000_000,
			fee_policy: option.feePolicy,
			stripe_checkout_session_id: session.id,
			updated_at: new Date().toISOString(),
		}).eq("id", quoteId).eq("workspace_id", workspaceId);
		if (updateError) throw updateError;

		return NextResponse.json({ url: session.url });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status = message === "unauthorized" ? 401 : message === "missing_team" ? 400 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}
