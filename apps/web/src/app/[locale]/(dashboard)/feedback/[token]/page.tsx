import type { Metadata } from "next";
import { FeedbackRequestForm } from "@/components/feedback/FeedbackRequestForm";
import { getFeedbackMessages } from "@/i18n/feedback";
import { Link } from "@/i18n/navigation";
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
		title: getFeedbackMessages(resolveLocale(locale)).metaTitle,
		robots: { index: false, follow: false },
	};
}

// Opened from a feedback request email. The token is the only credential, so the page
// works without signing in or accepting analytics cookies.
export default async function FeedbackPage({ params }: { params: Params }) {
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
			<div className="mx-auto w-full max-w-2xl space-y-8">
				{request ? (
					<>
						<header className="space-y-3">
							<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{messages.titles[request.segment]}</h1>
							<p className="text-muted-foreground">{messages.intro}</p>
							{request.responded ? null : <p className="text-sm text-muted-foreground">{messages.rewardNote}</p>}
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
