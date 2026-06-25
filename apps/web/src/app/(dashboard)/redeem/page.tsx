import { Metadata } from "next";
import { redirect } from "next/navigation";
import RedeemCreditCodeCard from "@/components/(gateway)/credits/RedeemCreditCodeCard";
import { fetchRedeemInitialData } from "@/lib/fetchers/internal/fetchRedeemInitialData";

export const metadata: Metadata = {
	title: "Redeem Code",
};

export default async function RedeemPage() {
	const initialData = await fetchRedeemInitialData();

	if (!initialData.signedIn) {
		redirect("/sign-in?returnUrl=%2Fredeem");
	}

	return (
		<div className="container mx-auto flex w-full flex-1 min-h-0 flex-col justify-center px-4 py-4 sm:py-6">
			<div className="mx-auto w-full max-w-2xl">
				<RedeemCreditCodeCard
					teams={initialData.teamOptions}
					invoiceTeamIds={initialData.invoiceTeamIds}
					defaultWorkspaceId={initialData.activeWorkspaceId}
					title="Redeem Promo Code"
					description="Enter your promo code below to receive credits."
					submitLabel="Redeem Code"
					showTeamSelector={initialData.teamOptions.length > 1}
					showDisclaimer
				/>
			</div>
		</div>
	);
}
