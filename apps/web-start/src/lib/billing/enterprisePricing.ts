export const ENTERPRISE_PRICING_VERSION = "2026-10-02-enterprise-entry";
export const ENTERPRISE_MIN_SELF_SERVE_MEMBERS = 1;
export const ENTERPRISE_BASE_INCLUDED_MEMBERS = 100;
export const ENTERPRISE_MAX_SELF_SERVE_MEMBERS = 100_000;
export const ENTERPRISE_MAX_QUOTED_MEMBERS = 2_147_483_647;
export const ENTERPRISE_MEMBER_OVERAGE_USD = 0.02;

export type EnterprisePlanVariant = "core" | "included_payments";
export type EnterprisePaymentPreference = "card" | "ach" | "bank_transfer";

export type EnterpriseQuestionnaire = {
	memberCount: number;
	expectedMonthlyTopUpUsd: number;
	typicalTopUpUsd: number;
	paymentPreference: EnterprisePaymentPreference;
	needsSso: boolean;
	needsScim: boolean;
	wantsSlackConnect: boolean;
};

export type EnterpriseTier = {
	key: string;
	label: string;
	maxMembers: number;
	coreMonthlyUsd: number;
	includedPaymentsMonthlyUsd: number;
	includedCardTopUpUsd: number;
};

export type EnterpriseQuoteOption = {
	variant: EnterprisePlanVariant;
	planKey: string;
	monthlyUsd: number;
	includedMembers: number;
	includedCardTopUpUsd: number;
	overageMembers: number;
	overageMemberMonthlyUsd: number;
	estimatedOverageMonthlyUsd: number;
	estimatedMonthlyUsd: number;
	feePolicy: "standard_5_percent" | "included_allowance";
};

const ENTERPRISE_PRICE_ANCHORS = [
	{ members: ENTERPRISE_BASE_INCLUDED_MEMBERS, monthlyUsd: 29 },
	{ members: 1_000, monthlyUsd: 79 },
	{ members: 10_000, monthlyUsd: 299 },
	{ members: 25_000, monthlyUsd: 599 },
	{ members: 50_000, monthlyUsd: 1_099 },
	{ members: 100_000, monthlyUsd: 1_999 },
] as const;

function enterpriseMonthlyUsd(memberCount: number): number {
	if (memberCount >= ENTERPRISE_MAX_SELF_SERVE_MEMBERS) return ENTERPRISE_PRICE_ANCHORS.at(-1)!.monthlyUsd;
	const upperIndex = ENTERPRISE_PRICE_ANCHORS.findIndex((anchor) => memberCount <= anchor.members);
	if (upperIndex <= 0) return ENTERPRISE_PRICE_ANCHORS[0].monthlyUsd;
	const lower = ENTERPRISE_PRICE_ANCHORS[upperIndex - 1];
	const upper = ENTERPRISE_PRICE_ANCHORS[upperIndex];
	const progress = (memberCount - lower.members) / (upper.members - lower.members);
	return Math.round(lower.monthlyUsd + (upper.monthlyUsd - lower.monthlyUsd) * progress);
}

export function enterpriseTierForMembers(memberCount: number): EnterpriseTier {
	if (!Number.isInteger(memberCount) || memberCount < ENTERPRISE_MIN_SELF_SERVE_MEMBERS || memberCount > ENTERPRISE_MAX_QUOTED_MEMBERS) throw new Error("member_count_out_of_range");
	const coreMonthlyUsd = enterpriseMonthlyUsd(memberCount);
	const includedMembers = Math.min(Math.max(memberCount, ENTERPRISE_BASE_INCLUDED_MEMBERS), ENTERPRISE_MAX_SELF_SERVE_MEMBERS);
	return {
		key: `members_${Math.max(memberCount, ENTERPRISE_BASE_INCLUDED_MEMBERS)}`,
		label: `Up to ${includedMembers.toLocaleString("en-US")} workspace members`,
		maxMembers: includedMembers,
		coreMonthlyUsd,
		includedPaymentsMonthlyUsd: coreMonthlyUsd,
		includedCardTopUpUsd: 0,
	};
}

export function normalizeEnterpriseQuestionnaire(input: Partial<EnterpriseQuestionnaire>): EnterpriseQuestionnaire {
	const memberCount = Math.round(Number(input.memberCount));
	const expectedMonthlyTopUpUsd = Math.round(Number(input.expectedMonthlyTopUpUsd));
	const typicalTopUpUsd = Math.round(Number(input.typicalTopUpUsd));
	const paymentPreference = input.paymentPreference;
	if (!Number.isFinite(memberCount) || memberCount < ENTERPRISE_MIN_SELF_SERVE_MEMBERS || memberCount > ENTERPRISE_MAX_QUOTED_MEMBERS) throw new Error("member_count_out_of_range");
	if (!Number.isFinite(expectedMonthlyTopUpUsd) || expectedMonthlyTopUpUsd < 0 || expectedMonthlyTopUpUsd > 10_000_000) throw new Error("monthly_top_up_out_of_range");
	if (!Number.isFinite(typicalTopUpUsd) || typicalTopUpUsd < 0 || typicalTopUpUsd > 10_000_000) throw new Error("typical_top_up_out_of_range");
	if (paymentPreference !== "card" && paymentPreference !== "ach" && paymentPreference !== "bank_transfer") throw new Error("invalid_payment_preference");
	return { memberCount, expectedMonthlyTopUpUsd, typicalTopUpUsd, paymentPreference, needsSso: Boolean(input.needsSso), needsScim: Boolean(input.needsScim), wantsSlackConnect: Boolean(input.wantsSlackConnect) };
}

export function enterpriseQuoteOptions(questionnaire: EnterpriseQuestionnaire): { tier: EnterpriseTier; recommendedVariant: EnterprisePlanVariant; options: EnterpriseQuoteOption[] } {
	const tier = enterpriseTierForMembers(questionnaire.memberCount);
	const overageMembers = Math.max(0, questionnaire.memberCount - tier.maxMembers);
	const estimatedOverageMonthlyUsd = Number((overageMembers * ENTERPRISE_MEMBER_OVERAGE_USD).toFixed(2));
	return {
		tier,
		recommendedVariant: "core",
		options: [
			{ variant: "core", planKey: `enterprise_core_${tier.key}`, monthlyUsd: tier.coreMonthlyUsd, includedMembers: tier.maxMembers, includedCardTopUpUsd: 0, overageMembers, overageMemberMonthlyUsd: ENTERPRISE_MEMBER_OVERAGE_USD, estimatedOverageMonthlyUsd, estimatedMonthlyUsd: tier.coreMonthlyUsd + estimatedOverageMonthlyUsd, feePolicy: "standard_5_percent" },
		],
	};
}
