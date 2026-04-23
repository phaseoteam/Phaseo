import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Billing Onboarding - Settings",
};

export default function BillingOnboardingPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Invoicing"
				description="Invoicing is coming soon."
			/>
			<Card>
				<CardContent className="pt-6 text-sm text-muted-foreground">
					Wallet top-ups remain the available billing method for now.
				</CardContent>
			</Card>
		</div>
	);
}
