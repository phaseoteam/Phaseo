import CurrentCredits from "@/components/(gateway)/credits/CurrentCredits";
import EnterpriseSubscriptionCard from "@/components/(gateway)/credits/EnterpriseSubscriptionCard";
import Banner from "@/components/(gateway)/credits/Banner";
import BuyCreditsClient from "@/components/(gateway)/credits/CreditPurchases/TopUp/BuyCreditsClient";
import AutoTopUpClient from "@/components/(gateway)/credits/CreditPurchases/AutoTopUp/AutoTopUpClient";
import { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import type { StringSearch } from "@/lib/start/search";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { creditsInitialDataQuery } from "./credits.functions";
import { projectCreditRunway } from "@/lib/gateway/usage/creditRunway";
import { getSettingsMessages } from "@/i18n/settings";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";

export async function getCreditsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI");
	return { title: t("billingCopy.metadataTitle") };
}

export default function CreditsPage() {
	return (
		<div className="space-y-4">
			<Suspense fallback={<SettingsSectionFallback />}>
				<CreditsSettingsContent />
			</Suspense>
		</div>
	);
}

function CreditsSettingsContent() {
	const t = useTranslations("SettingsUI");
	const { locale } = useParams({ strict: false });
	const messages = getSettingsMessages((locale && isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	const searchParams = useSearch({ from: "/{-$locale}/_dashboard/settings/credits/" }) as StringSearch;
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(searchParams)) {
		if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
		else if (typeof v === "string") params.append(k, v);
	}
	const queryString = params.toString();

	const { data: initialData } = useSuspenseQuery(creditsInitialDataQuery());

	return (
		<div
			className="space-y-4"
			data-obfuscate-pii={initialData.obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<SettingsPageHeader
				title={t("sidebarNew.billingCredits")}
				description={t("billingCopy.description")}
			/>

			{initialData.workspaceId ? <EnterpriseSubscriptionCard workspaceId={initialData.workspaceId} /> : null}

			<Banner
				queryString={queryString ?? null}
				latestPaymentSuccessAt={initialData.latestPaymentSuccessAt}
			/>

			<CurrentCredits
				balance={initialData.initialBalance}
				runway={
					initialData.recentCreditSpend
						? projectCreditRunway({
								balanceNanos: initialData.initialBalance * 1_000_000_000,
								dailyNanos: initialData.recentCreditSpend.dailyNanos,
								observedAt: initialData.recentCreditSpend.observedAt,
								autoTopUpEnabled: Boolean(initialData.wallet?.auto_top_up_enabled),
								autoTopUpThresholdNanos: Number(initialData.wallet?.low_balance_threshold ?? 0) || 0,
							})
						: null
				}
				title={t("billingCopy.modelUsageBalance")}
				refreshAriaLabel={messages.pages.refreshBalance}
			/>

			<div className="space-y-4">
				<Card size="sm" className="py-0">
					<CardContent className="p-0">
						<div className="grid grid-cols-1 md:grid-cols-2">
							<div className="p-4 md:p-5">
								<BuyCreditsClient
									declaredCountryCode={initialData.declaredCountryCode}
									wallet={initialData.wallet}
									stripeInfo={initialData.stripeInfo}
									embedded
								/>
							</div>
							<div className="border-t p-4 md:border-t-0 md:border-l md:p-5">
								<AutoTopUpClient
									wallet={initialData.wallet}
									stripeInfo={initialData.stripeInfo}
									mfaEnabled={initialData.mfaEnabled}
									embedded
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
