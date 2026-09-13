import { NextResponse } from "next/server";
import { IDENTITY_ADDON_KEY, isWorkspaceAddonActive } from "@/lib/billing/identityAddon";
import { ENTERPRISE_PRICING_VERSION, enterpriseQuoteOptions, normalizeEnterpriseQuestionnaire, type EnterprisePlanVariant } from "@/lib/billing/enterprisePricing";
import { readBoundedTextBody } from "@/lib/server/boundedRequestBody";
import { getStripe } from "@/lib/stripe";
import { requireActiveWorkspaceBillingAdmin, requireActiveWorkspaceStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";

const SETTINGS_PATH = "/settings/workspaces/enterprise";

function settingsUrl(request: Request, workspaceId: string, result?: string) {
	const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
	const url = new URL(SETTINGS_PATH, base);
	url.searchParams.set("workspaceId", workspaceId);
	if (result) url.searchParams.set("identity", result);
	return url.toString();
}

async function currentSubscription(workspaceId: string) {
	const { data, error } = await createAdminClient()
		.from("workspace_addon_subscriptions")
		.select("status,current_period_end,cancel_at_period_end,grace_until,metadata,provider,provider_subscription_id,plan_key,pricing_version,included_members,fee_policy,included_card_top_up_nanos")
		.eq("workspace_id", workspaceId)
		.eq("addon_key", IDENTITY_ADDON_KEY)
		.maybeSingle();
	if (error) throw error;
	return data;
}

export async function GET(request: Request) {
	try {
		const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
		const { workspaceId } = await requireActiveWorkspaceBillingAdmin(["owner", "admin"], requestedWorkspaceId);
		const canAccessSettings = await enterpriseSelfServePreviewEnabled();
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
			provider: subscription?.provider ?? null,
			planKey: subscription?.plan_key ?? null,
			pricingVersion: subscription?.pricing_version ?? null,
			includedMembers: subscription?.included_members ?? null,
			feePolicy: subscription?.fee_policy ?? null,
			includedCardTopUpUsd: Number(subscription?.included_card_top_up_nanos ?? 0) / 1_000_000_000,
			remainingCardTopUpUsd: Math.max(0, Number(subscription?.included_card_top_up_nanos ?? 0) - usedNanos) / 1_000_000_000,
			canAccessSettings,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status = message === "unauthorized" ? 401 : message === "missing_team" ? 400 : 503;
		return NextResponse.json({ error: message }, { status });
	}
}

export async function POST(request: Request) {
	try {
		if (!(await enterpriseSelfServePreviewEnabled())) return NextResponse.json({ error: "Not found" }, { status: 404 });
		const bodyResult = await readBoundedTextBody(request, 8_192);
		if (!bodyResult.ok) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
		const body = JSON.parse(bodyResult.text || "{}");
		const requestedWorkspaceId = String(body.workspaceId ?? "").trim();
		const { workspaceId, customerId } = await requireActiveWorkspaceStripeCustomer({
			createIfMissing: true,
			workspaceId: requestedWorkspaceId,
		});
		const existing = await currentSubscription(workspaceId);
		if (isWorkspaceAddonActive(existing)) {
			return NextResponse.json({ error: "Identity is already active" }, { status: 409 });
		}
		const quoteId = String(body.quoteId ?? "").trim();
		const selectedVariant = String(body.variant ?? "") as EnterprisePlanVariant;
		if (!quoteId || selectedVariant !== "core") {
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
		if (
			!option
			|| calculated.tier.key !== quoteRow.tier_key
			|| option.monthlyUsd * 100 !== Number(quoteRow.monthly_price_cents)
			|| option.includedMembers !== Number(quoteRow.included_members)
			|| option.feePolicy !== quoteRow.fee_policy
		) {
			return NextResponse.json({ error: "Quote no longer matches pricing" }, { status: 409 });
		}
		const { count: currentMemberCount, error: memberCountError } = await admin
			.from("workspace_members")
			.select("user_id", { count: "exact", head: true })
			.eq("workspace_id", workspaceId);
		if (memberCountError) throw memberCountError;
		if (option.includedMembers < 100_000 && (currentMemberCount ?? 0) > option.includedMembers) {
			return NextResponse.json({ error: "Your workspace has grown beyond this quote. Please calculate a new one." }, { status: 409 });
		}
		const stripe = getStripe();
		const existingSessionId = String(quoteRow.stripe_checkout_session_id ?? "").trim();
		if (existingSessionId) {
			const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
			if (existingSession.status === "open" && existingSession.url) {
				return NextResponse.json({ url: existingSession.url });
			}
			return NextResponse.json({ error: "This checkout can no longer be reused. Please calculate a new quote." }, { status: 409 });
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
			client_reference_id: workspaceId,
			line_items: [{
				price_data: {
					currency: "usd",
					unit_amount: option.monthlyUsd * 100,
					recurring: { interval: "month" },
					product_data: {
						name: "Phaseo Self Serve Enterprise",
						description: `${option.includedMembers.toLocaleString("en-US")} active members`,
						metadata: { addon_key: IDENTITY_ADDON_KEY, pricing_version: ENTERPRISE_PRICING_VERSION },
					},
				},
				quantity: 1,
			}],
			allow_promotion_codes: false,
			billing_address_collection: "required",
			success_url: settingsUrl(request, workspaceId, "success"),
			cancel_url: settingsUrl(request, workspaceId, "canceled"),
			metadata,
			subscription_data: {
				metadata,
			},
		}, {
			idempotencyKey: `enterprise-checkout:${ENTERPRISE_PRICING_VERSION}:${quoteId}`,
		});
		if (!session.url) throw new Error("Stripe did not return a checkout URL");
		const { error: updateError } = await admin.from("workspace_enterprise_quotes").update({
			selected_variant: selectedVariant,
			plan_key: option.planKey,
			monthly_price_cents: option.monthlyUsd * 100,
			included_members: option.includedMembers,
			included_card_top_up_nanos: option.includedCardTopUpUsd * 1_000_000_000,
			fee_policy: option.feePolicy,
			stripe_checkout_session_id: session.id,
			updated_at: new Date().toISOString(),
		}).eq("id", quoteId).eq("workspace_id", workspaceId).is("consumed_at", null).is("stripe_checkout_session_id", null);
		if (updateError) throw updateError;

		return NextResponse.json({ url: session.url });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status = message === "unauthorized" ? 401 : message === "missing_team" ? 400 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}
