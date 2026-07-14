import CurrentCredits from "@/components/(gateway)/credits/CurrentCredits";
import Banner from "@/components/(gateway)/credits/Banner";
import BuyCreditsClient from "@/components/(gateway)/credits/CreditPurchases/TopUp/BuyCreditsClient";
import AutoTopUpClient from "@/components/(gateway)/credits/CreditPurchases/AutoTopUp/AutoTopUpClient";
import LowBalanceEmailAlertsClient from "@/components/(gateway)/credits/LowBalanceEmailAlertsClient";
import { Metadata } from "next";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { fetchSettingsCreditsInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsInitialData";

export const metadata: Metadata = {
	title: "Credits - Settings",
};

export default function Page(props: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div className="space-y-4">
			<Suspense fallback={<SettingsSectionFallback />}>
				<CreditsSettingsContent searchParams={props.searchParams} />
			</Suspense>
		</div>
	);
}

async function CreditsSettingsContent(props: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	const searchParams = await props.searchParams;
	const params = new URLSearchParams();
	if (searchParams) {
		for (const [k, v] of Object.entries(searchParams)) {
			if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
			else if (typeof v === "string") params.append(k, v);
		}
	}
	const queryString = params.toString();

	const initialData = await fetchSettingsCreditsInitialData();

	return (
		<div
			className="space-y-4"
			data-obfuscate-pii={initialData.obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<SettingsPageHeader title="Credits" />

			<Banner
				queryString={queryString ?? null}
				latestPaymentSuccessAt={initialData.latestPaymentSuccessAt}
			/>

			<CurrentCredits
				balance={initialData.initialBalance}
				title="Current Balance"
				refreshAriaLabel="refresh balance"
			/>

			<div className="space-y-4">
				<Card size="sm" className="py-0">
					<CardContent className="p-0">
						<div className="grid grid-cols-1 md:grid-cols-2">
							<div className="p-4 md:p-5">
								<BuyCreditsClient
									wallet={initialData.wallet}
									stripeInfo={initialData.stripeInfo}
									embedded
								/>
							</div>
							<div className="border-t p-4 md:border-t-0 md:border-l md:p-5">
								<AutoTopUpClient
									wallet={initialData.wallet}
									stripeInfo={initialData.stripeInfo}
									embedded
								/>
							</div>
						</div>
					</CardContent>
				</Card>
				<div>
					<LowBalanceEmailAlertsClient
						enabled={initialData.lowBalanceEmailEnabled}
						thresholdUsd={initialData.lowBalanceEmailThresholdUsd}
					/>
				</div>
			</div>
		</div>
	);
}
