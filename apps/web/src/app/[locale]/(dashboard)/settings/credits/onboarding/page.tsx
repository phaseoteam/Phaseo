import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import EnterpriseBillingOnboardingClient from "@/components/(gateway)/credits/EnterpriseBillingOnboardingClient";
import { Card, CardContent } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { fetchSettingsCreditsOnboardingInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsOnboardingInitialData";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: t("headers.billingOnboarding") + " - " + t("headers.settings") };
}

export default async function BillingOnboardingPage() {
	const t = await getTranslations("SettingsUI");
	const initialData = await fetchSettingsCreditsOnboardingInitialData();

	if (!initialData.signedIn) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					titleKey="headers.billingOnboarding"
					description="Sign in to continue setting up workspace billing."
					descriptionKey="headers.billingOnboardingSignIn"
				/>
			</div>
		);
	}

	if (!initialData.workspaceId) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					titleKey="headers.billingOnboarding"
					description="Select a workspace to continue setup."
					descriptionKey="headers.billingOnboardingWorkspace"
				/>
			</div>
		);
	}

	if (!initialData.team) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Billing onboarding"
					titleKey="headers.billingOnboarding"
					description="Could not load the active workspace."
					descriptionKey="headers.billingOnboardingError"
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
						{t("settingsPageCopy.billingAdminsOnly")}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
