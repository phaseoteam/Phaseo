import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { useParams } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SpendReportSubscriptionButton } from "@/components/spend-reports/SpendReportSubscriptionButton";
import { getFeedbackMessages } from "@/i18n/feedback";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { spendReportSubscriptionQuery } from "./unsubscribe.queries";

// The unsubscribe link in every spend report email. Works signed out: the token in the URL is the
// only credential, and it only switches that person's report emails for one workspace.

const ROUTE_ID = "/{-$locale}/_dashboard/spend-reports/$token/unsubscribe/";

function resolveLocale(locale: string | undefined): PublicLocale {
	return (locale && isPublicLocale(locale) ? locale : "en-GB") as PublicLocale;
}

export async function getSpendReportUnsubscribeMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params;
	return {
		title: getFeedbackMessages(resolveLocale(locale)).spendReports.metaTitle,
		robots: { index: false, follow: false },
		referrer: "no-referrer",
	};
}

export default function SpendReportUnsubscribePage() {
	const { locale, token } = useParams({ from: ROUTE_ID });
	const messages = getFeedbackMessages(resolveLocale(locale)).spendReports;

	const { data: { subscription, unavailable } } = useSuspenseQuery(spendReportSubscriptionQuery(token));

	return (
		<div className="container mx-auto flex w-full flex-1 flex-col px-4 py-10 sm:py-16">
			<div className="mx-auto w-full max-w-xl space-y-6">
				{subscription ? (
					<>
						<header className="space-y-3">
							<h1 className="text-2xl font-semibold tracking-tight">{messages.title.replace("{workspace}", subscription.workspaceName)}</h1>
						</header>
						<SpendReportSubscriptionButton token={token} subscribed={subscription.subscribed} messages={messages} />
					</>
				) : (
					<header className="space-y-3">
						<h1 className="text-2xl font-semibold tracking-tight">{messages.invalidTitle}</h1>
						<p className="text-muted-foreground">{unavailable ? messages.unavailable : messages.invalidBody}</p>
					</header>
				)}
			</div>
		</div>
	);
}
