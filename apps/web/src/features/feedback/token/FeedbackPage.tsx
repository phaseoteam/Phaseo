import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { FeedbackRequestForm } from "@/components/feedback/FeedbackRequestForm";
import { getFeedbackMessages } from "@/i18n/feedback";
import { Link } from "@/i18n/navigation";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { useParams } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { feedbackRequestQuery } from "./page.queries";

const ROUTE_ID = "/{-$locale}/_dashboard/feedback/$token/";

function resolveLocale(locale: string | undefined): PublicLocale {
	return (locale && isPublicLocale(locale) ? locale : "en-GB") as PublicLocale;
}

export async function getFeedbackMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params;
	return {
		title: getFeedbackMessages(resolveLocale(locale)).metaTitle,
		robots: { index: false, follow: false },
		// The token is in the URL, so don't hand it to the next page as a referrer.
		referrer: "no-referrer",
	};
}

// Opened from a feedback request email. The token is the only credential, so the page
// works without signing in, and analytics stays off for any visit that starts here
// (see isAnalyticsBlockedForPageLoad).
export default function FeedbackPage() {
	const { locale, token } = useParams({ from: ROUTE_ID });
	const messages = getFeedbackMessages(resolveLocale(locale));

	const { data: { request, unavailable } } = useSuspenseQuery(feedbackRequestQuery(token));

	return (
		<div className="container mx-auto flex w-full flex-1 flex-col px-4 py-10 sm:py-16">
			<div className="mx-auto w-full max-w-2xl space-y-8">
				{request ? (
					<>
						<header className="space-y-3">
							<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{messages.titles[request.segment]}</h1>
							<p className="text-muted-foreground">{messages.intro}</p>
							{!request.responded && request.rewardAvailable ? (
								<p className="text-sm text-muted-foreground">{messages.rewardNote}</p>
							) : null}
						</header>
						<FeedbackRequestForm
							token={token}
							segment={request.segment}
							responded={request.responded}
							rewardCode={request.rewardCode}
							messages={messages}
						/>
						<p className="border-t pt-6 text-sm text-muted-foreground">
							<Link href={`/feedback/${token}/unsubscribe`} className="underline underline-offset-4 hover:text-foreground">
								{messages.unsubscribeLink}
							</Link>
						</p>
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
