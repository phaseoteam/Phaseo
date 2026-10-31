import { PageMetadata } from "@/lib/seo/metadataTypes";
import { useParams, useSearch } from "@tanstack/react-router";
import { defaultLocale } from "@/i18n/locales";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import RedeemCreditCodeCard from "@/components/(gateway)/credits/RedeemCreditCodeCard";
import { getSettingsMessages } from "@/i18n/settings";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { getRedeemMessages } from "@/i18n/redeem";
import { redeemCodeFromSearch, redeemPageQuery } from "./redeem.functions";

export async function getRedeemMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params;
	const messages = getSettingsMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	return { title: messages.pages.redeem };
}

// The signed-out redirect to sign-in runs in the route's beforeLoad (redeemPageQuery).
export default function RedeemPage() {
	const { locale = defaultLocale } = useParams({ strict: false });
	const { code: rawCode } = useSearch({ from: "/{-$locale}/_dashboard/redeem/" }) as { code?: string | string[] };
	const redeemMessages = getRedeemMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	// Links such as the feedback thank-you page prefill the code; anything malformed is ignored.
	const code = redeemCodeFromSearch(rawCode);
	const { data: initialData } = useSuspenseQuery(redeemPageQuery(locale, code));

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
					initialCode={code}
				/>
			</div>
		</div>
	);
}
