import type { Metadata } from "next";
import { SpendReportSubscriptionButton } from "@/components/spend-reports/SpendReportSubscriptionButton";
import { getFeedbackMessages } from "@/i18n/feedback";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { isSpendReportToken, spendReportApiPath, type SpendReportSubscriptionView } from "@/lib/spendReports";
import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";

// The unsubscribe link in every spend report email. Works signed out: the token in the URL is the
// only credential, and it only switches that person's report emails for one workspace.

type Params = Promise<{ locale: string; token: string }>;

function resolveLocale(locale: string): PublicLocale {
	return (isPublicLocale(locale) ? locale : "en-GB") as PublicLocale;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
	const { locale } = await params;
	return {
		title: getFeedbackMessages(resolveLocale(locale)).spendReports.metaTitle,
		robots: { index: false, follow: false },
		referrer: "no-referrer",
	};
}

export default async function SpendReportUnsubscribePage({ params }: { params: Params }) {
	const { locale, token } = await params;
	const messages = getFeedbackMessages(resolveLocale(locale)).spendReports;

	let subscription: SpendReportSubscriptionView | null = null;
	let unavailable = false;
	if (isSpendReportToken(token)) {
		try {
			subscription = await fetchOptionalPublicWebApi<SpendReportSubscriptionView>(spendReportApiPath(token));
		} catch {
			unavailable = true;
		}
	}

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
