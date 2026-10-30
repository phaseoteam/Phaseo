import { NextResponse } from "next/server";
import {
	ENTERPRISE_PRICING_VERSION,
	enterpriseQuoteOptions,
	normalizeEnterpriseQuestionnaire,
} from "@/lib/billing/enterprisePricing";
import { readBoundedTextBody } from "@/lib/server/boundedRequestBody";
import { requireActiveWorkspaceBillingAdmin } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";

const MAX_BODY_BYTES = 16_384;
const NANOS_PER_USD = 1_000_000_000;

export async function POST(request: Request) {
	try {
		if (!(await enterpriseSelfServePreviewEnabled())) return NextResponse.json({ error: "Not found" }, { status: 404 });
		const bodyResult = await readBoundedTextBody(request, MAX_BODY_BYTES);
		if (!bodyResult.ok) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
		const body = JSON.parse(bodyResult.text || "{}");
		const questionnaire = normalizeEnterpriseQuestionnaire(body);
		const quote = enterpriseQuoteOptions(questionnaire);
		const requestedWorkspaceId = String(body.workspaceId ?? "").trim();
		const { workspaceId } = await requireActiveWorkspaceBillingAdmin(["owner", "admin"], requestedWorkspaceId);
		const admin = createAdminClient();
		const { count: currentMembers, error: memberError } = await admin
			.from("workspace_members")
			.select("user_id", { count: "exact", head: true })
			.eq("workspace_id", workspaceId);
		if (memberError) throw memberError;
		if ((currentMembers ?? 0) > Math.max(questionnaire.memberCount, quote.tier.maxMembers)) {
			return NextResponse.json({ error: `This workspace already has ${currentMembers} members. Choose at least that many.` }, { status: 400 });
		}
		const option = quote.options[0];
		const { data, error } = await admin
			.from("workspace_enterprise_quotes")
			.insert({
				workspace_id: workspaceId,
				pricing_version: ENTERPRISE_PRICING_VERSION,
				member_count: questionnaire.memberCount,
				tier_key: quote.tier.key,
				expected_monthly_top_up_nanos: questionnaire.expectedMonthlyTopUpUsd * NANOS_PER_USD,
				typical_top_up_nanos: questionnaire.typicalTopUpUsd * NANOS_PER_USD,
				payment_preference: questionnaire.paymentPreference,
				needs_sso: questionnaire.needsSso,
				needs_scim: questionnaire.needsScim,
				wants_slack_connect: questionnaire.wantsSlackConnect,
				recommended_variant: quote.recommendedVariant,
				selected_variant: option.variant,
				plan_key: option.planKey,
				monthly_price_cents: option.monthlyUsd * 100,
				included_members: option.includedMembers,
				included_card_top_up_nanos: option.includedCardTopUpUsd * NANOS_PER_USD,
				fee_policy: option.feePolicy,
				questionnaire,
			})
			.select("id,expires_at")
			.single();
		if (error) throw error;

		return NextResponse.json({
			quoteId: data.id,
			expiresAt: data.expires_at,
			pricingVersion: ENTERPRISE_PRICING_VERSION,
			tier: quote.tier,
			recommendedVariant: quote.recommendedVariant,
			options: quote.options,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status = message === "unauthorized" ? 401 : message === "missing_team" ? 400 : message.includes("JSON") || message.includes("invalid") || message.includes("out_of_range") ? 400 : 503;
		return NextResponse.json({ error: message }, { status });
	}
}
