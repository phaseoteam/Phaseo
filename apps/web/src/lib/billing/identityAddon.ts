export const IDENTITY_ADDON_KEY = "identity";

export type WorkspaceAddonStatus =
	| "incomplete"
	| "incomplete_expired"
	| "trialing"
	| "active"
	| "past_due"
	| "paused"
	| "canceled"
	| "unpaid";

export type IdentityAddonSummary = {
	active: boolean;
	status: WorkspaceAddonStatus | "not_subscribed";
	cancelAtPeriodEnd: boolean;
	currentPeriodEnd: string | null;
	grandfathered: boolean;
	planKey: string | null;
	pricingVersion: string | null;
	includedMembers: number | null;
	feePolicy: "standard_5_percent" | "included_allowance" | null;
	includedCardTopUpUsd: number;
	remainingCardTopUpUsd: number;
};

export function isWorkspaceAddonActive(row: {
	status?: string | null;
	grace_until?: string | null;
} | null): boolean {
	const status = String(row?.status ?? "").toLowerCase();
	if (status === "active" || status === "trialing") return true;
	if (status !== "past_due" || !row?.grace_until) return false;
	return Date.parse(row.grace_until) > Date.now();
}
