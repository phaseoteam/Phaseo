import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import EnterpriseBillingOnboardingClient from "@/components/(gateway)/credits/EnterpriseBillingOnboardingClient";
import { Card, CardContent } from "@/components/ui/card";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchSettingsCreditsOnboardingInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsOnboardingInitialData";

export const metadata: Metadata = {
	title: "Billing Onboarding - Settings",
};

export default async function BillingOnboardingPage() {
	const initialData = await fetchSettingsCreditsOnboardingInitialData();

	if (!initialData.signedIn) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					description="Sign in to continue setting up workspace billing."
				/>
			</div>
		);
	}

	if (!initialData.workspaceId) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					description="Select a workspace to continue setup."
				/>
			</div>
		);
	}

	if (!initialData.team) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					description="Could not load the active workspace."
				/>
			</div>
		);
	}

	if (!initialData.canAccessOnboarding) {
		redirect("/settings/credits");
	}

	return (
		<div className="space-y-6">
			{initialData.canManageBilling ? (
				<EnterpriseBillingOnboardingClient
					teamName={initialData.team.name}
					teamTier={initialData.team.tier}
					currentBillingMode={initialData.currentBillingMode}
					invoiceProfileEnabled={initialData.invoiceProfileEnabled}
					initialBillingDay={initialData.initialBillingDay}
					initialPaymentTermsDays={initialData.initialPaymentTermsDays}
					signerName={initialData.signerName}
				/>
			) : (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						Only owners and admins can change billing setup for this workspace.
					</CardContent>
				</Card>
			)}
		</div>
	);
}
