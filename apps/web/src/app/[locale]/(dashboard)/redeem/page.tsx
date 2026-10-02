import { Metadata } from "next";
import { redirect } from "next/navigation";
import RedeemCreditCodeCard from "@/components/(gateway)/credits/RedeemCreditCodeCard";
import { fetchRedeemInitialData } from "@/lib/fetchers/internal/fetchRedeemInitialData";
import { getSettingsMessages } from "@/i18n/settings";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { getRedeemMessages } from "@/i18n/redeem";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params;
	const messages = getSettingsMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	return { title: messages.pages.redeem };
}

export default async function RedeemPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const redeemMessages = getRedeemMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	const initialData = await fetchRedeemInitialData();

	if (!initialData.signedIn) {
		redirect(`/${locale === "en-GB" ? "" : `${locale}/`}sign-in?returnUrl=${encodeURIComponent(`/${locale === "en-GB" ? "" : `${locale}/`}redeem`)}`);
	}

	return (
		<div className="container mx-auto flex w-full flex-1 min-h-0 flex-col justify-center px-4 py-4 sm:py-6">
			<div className="mx-auto w-full max-w-2xl">
				<RedeemCreditCodeCard
					teams={initialData.teamOptions}
					invoiceTeamIds={initialData.invoiceTeamIds}
					defaultWorkspaceId={initialData.activeWorkspaceId}
					title={redeemMessages.title}
					description={redeemMessages.description}
					submitLabel={redeemMessages.submit}
					showTeamSelector={initialData.teamOptions.length > 1}
					showDisclaimer
				/>
			</div>
		</div>
	);
}
