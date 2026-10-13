import type { Metadata } from "next";
import { FeedbackUnsubscribeButton } from "@/components/feedback/FeedbackUnsubscribeButton";
import { getFeedbackMessages } from "@/i18n/feedback";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { feedbackApiPath, isFeedbackToken, type FeedbackRequestView } from "@/lib/feedbackRequests";
import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";

type Params = Promise<{ locale: string; token: string }>;

function resolveLocale(locale: string): PublicLocale {
	return (isPublicLocale(locale) ? locale : "en-GB") as PublicLocale;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
	const { locale } = await params;
	return {
		title: getFeedbackMessages(resolveLocale(locale)).unsubscribe.metaTitle,
		robots: { index: false, follow: false },
	};
}

export default async function FeedbackUnsubscribePage({ params }: { params: Params }) {
	const { locale, token } = await params;
	const messages = getFeedbackMessages(resolveLocale(locale));

	let request: FeedbackRequestView | null = null;
	let unavailable = false;
	if (isFeedbackToken(token)) {
		try {
			request = await fetchOptionalPublicWebApi<FeedbackRequestView>(feedbackApiPath(token));
		} catch {
			unavailable = true;
		}
	}

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
