import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { FeedbackUnsubscribeButton } from "@/components/feedback/FeedbackUnsubscribeButton";
import { getFeedbackMessages } from "@/i18n/feedback";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { useParams } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { feedbackRequestQuery } from "../page.queries";

const ROUTE_ID = "/{-$locale}/_dashboard/feedback/$token/unsubscribe/";

function resolveLocale(locale: string | undefined): PublicLocale {
	return (locale && isPublicLocale(locale) ? locale : "en-GB") as PublicLocale;
}

export async function getFeedbackUnsubscribeMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params;
	return {
		title: getFeedbackMessages(resolveLocale(locale)).unsubscribe.metaTitle,
		robots: { index: false, follow: false },
		referrer: "no-referrer",
	};
}

export default function FeedbackUnsubscribePage() {
	const { locale, token } = useParams({ from: ROUTE_ID });
	const messages = getFeedbackMessages(resolveLocale(locale));

	const { data: { request, unavailable } } = useSuspenseQuery(feedbackRequestQuery(token));

	return (
		<div className="container mx-auto flex w-full flex-1 flex-col px-4 py-10 sm:py-16">
			<div className="mx-auto w-full max-w-xl space-y-6">
				{request ? (
					<>
						<header className="space-y-3">
							<h1 className="text-2xl font-semibold tracking-tight">{messages.unsubscribe.title}</h1>
							<p className="text-muted-foreground">{messages.unsubscribe.body}</p>
						</header>
						<FeedbackUnsubscribeButton token={token} optedOut={request.optedOut} messages={messages.unsubscribe} />
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
