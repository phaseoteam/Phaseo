import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsCreditsOnboardingInitialData = {
	canAccessOnboarding: boolean;
	canManageBilling: boolean;
	currentBillingMode: "wallet" | "invoice";
	initialBillingDay: number;
	initialPaymentTermsDays: 14 | 30;
	invoiceProfileEnabled: boolean;
	signedIn: boolean;
	signerName: string;
	team: {
		name: string;
		tier: string;
	} | null;
	workspaceId: string | null;
};

function getDisplayName(user: {
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
}) {
	const fullName =
		typeof user.user_metadata?.full_name === "string"
			? user.user_metadata.full_name
			: null;
	const name =
		typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null;
	return (
		fullName?.trim() ||
		name?.trim() ||
		user.email?.split("@")[0] ||
		"Authorized Signer"
	);
}

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return NextResponse.json({
			canAccessOnboarding: false,
			canManageBilling: false,
			currentBillingMode: "wallet",
			initialBillingDay: 1,
			initialPaymentTermsDays: 30,
			invoiceProfileEnabled: false,
			signedIn: false,
			signerName: "Authorized Signer",
			team: null,
			workspaceId: null,
		} satisfies SettingsCreditsOnboardingInitialData);
	}

	const signerName = getDisplayName(user);
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		return NextResponse.json({
			canAccessOnboarding: false,
			canManageBilling: false,
			currentBillingMode: "wallet",
			initialBillingDay: 1,
			initialPaymentTermsDays: 30,
			invoiceProfileEnabled: false,
			signedIn: true,
			signerName,
			team: null,
			workspaceId: null,
		} satisfies SettingsCreditsOnboardingInitialData);
	}

	const [{ data: membership }, { data: team }, { data: invoiceProfile }] =
		await Promise.all([
			supabase
				.from("workspace_members")
				.select("role")
				.eq("workspace_id", workspaceId)
				.eq("user_id", user.id)
				.maybeSingle(),
			supabase
				.from("workspaces")
				.select("name,tier,billing_mode,invoice_onboarding_status")
				.eq("id", workspaceId)
				.maybeSingle(),
			supabase
				.from("workspace_invoice_profiles")
				.select("enabled,billing_day,payment_terms_days")
				.eq("workspace_id", workspaceId)
				.maybeSingle(),
		]);

	if (!team) {
		return NextResponse.json({
			canAccessOnboarding: false,
			canManageBilling: false,
			currentBillingMode: "wallet",
			initialBillingDay: 1,
			initialPaymentTermsDays: 30,
			invoiceProfileEnabled: false,
			signedIn: true,
			signerName,
			team: null,
			workspaceId,
		} satisfies SettingsCreditsOnboardingInitialData);
	}

	const role = String(membership?.role ?? "").toLowerCase();
	const currentBillingMode: "wallet" | "invoice" =
		team.billing_mode === "invoice" ? "invoice" : "wallet";
	const invoiceOnboardingStatus = String(
		team.invoice_onboarding_status ?? "none",
	).toLowerCase();

	return NextResponse.json({
		canAccessOnboarding:
			currentBillingMode === "invoice" ||
			invoiceOnboardingStatus === "pre_invoice",
		canManageBilling: role === "owner" || role === "admin",
		currentBillingMode,
		initialBillingDay: Math.min(
			28,
			Math.max(1, Number(invoiceProfile?.billing_day ?? 1) || 1),
		),
		initialPaymentTermsDays:
			Number(invoiceProfile?.payment_terms_days) === 14 ? 14 : 30,
		invoiceProfileEnabled: Boolean(invoiceProfile?.enabled),
		signedIn: true,
		signerName,
		team: {
			name: String(team.name ?? "Workspace"),
			tier: String(team.tier ?? "basic"),
		},
		workspaceId,
	} satisfies SettingsCreditsOnboardingInitialData);
}
