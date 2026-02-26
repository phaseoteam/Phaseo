import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import EnterpriseBillingOnboardingClient from "@/components/(gateway)/credits/EnterpriseBillingOnboardingClient";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Billing Onboarding - Settings",
};

function getDisplayName(user: {
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
}) {
	const fullName = typeof user.user_metadata?.full_name === "string"
		? user.user_metadata.full_name
		: null;
	const name = typeof user.user_metadata?.name === "string"
		? user.user_metadata.name
		: null;
	return (
		fullName?.trim() ||
		name?.trim() ||
		user.email?.split("@")[0] ||
		"Authorized Signer"
	);
}

export default async function BillingOnboardingPage() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					description="Sign in to continue setting up team billing."
				/>
			</div>
		);
	}
	const signerName = getDisplayName(user);

	const teamId = await getTeamIdFromCookie();
	if (!teamId) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					description="Select a team to continue setup."
				/>
			</div>
		);
	}

	const { data: membership } = await supabase
		.from("team_members")
		.select("role")
		.eq("team_id", teamId)
		.eq("user_id", user.id)
		.maybeSingle();

	const role = String(membership?.role ?? "").toLowerCase();
	const canManageBilling = role === "owner" || role === "admin";

	const { data: team } = await supabase
		.from("teams")
		.select("name,tier,billing_mode,invoice_onboarding_status")
		.eq("id", teamId)
		.maybeSingle();

	if (!team) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					description="Could not load the active team."
				/>
			</div>
		);
	}

	const { data: invoiceProfile } = await supabase
		.from("team_invoice_profiles")
		.select("enabled,billing_day,payment_terms_days")
		.eq("team_id", teamId)
		.maybeSingle();

	const currentBillingMode: "wallet" | "invoice" =
		team.billing_mode === "invoice" ? "invoice" : "wallet";
	const invoiceOnboardingStatus = String(
		team.invoice_onboarding_status ?? "none"
	).toLowerCase();
	const canAccessOnboarding =
		currentBillingMode === "invoice" || invoiceOnboardingStatus === "pre_invoice";

	if (!canAccessOnboarding) {
		redirect("/settings/credits");
	}

	const initialBillingDay = Math.min(
		28,
		Math.max(1, Number(invoiceProfile?.billing_day ?? 1) || 1),
	);
	const initialPaymentTermsDays =
		Number(invoiceProfile?.payment_terms_days) === 14 ? 14 : 30;

	return (
		<div className="space-y-6">
			{canManageBilling ? (
				<EnterpriseBillingOnboardingClient
					teamName={String(team.name ?? "Team")}
					teamTier={String(team.tier ?? "basic")}
					currentBillingMode={currentBillingMode}
					invoiceProfileEnabled={Boolean(invoiceProfile?.enabled)}
					initialBillingDay={initialBillingDay}
					initialPaymentTermsDays={initialPaymentTermsDays}
					signerName={signerName}
				/>
			) : (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						Only owners and admins can change billing setup for this team.
					</CardContent>
				</Card>
			)}
		</div>
	);
}
