import type { Metadata } from "@/lib/seo/metadataTypes";
import { use } from "react";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import SlackLinkConfirm from "./SlackLinkConfirm";
import { slackLinkLocale, slackLinkToken } from "./link.functions";

// The Slack agent DMs people a link here (/slack/link?token=…) to connect their
// Slack account to their Phaseo account. Signed-out visitors sign in first and
// come back with the same token. Analytics stays off for visits that start here
// (see isAnalyticsBlockedForPageLoad).

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: (isPublicLocale(locale) ? locale : "en-GB") as PublicLocale, namespace: "SettingsUI.slack.link" });
	return {
		title: t("metaTitle"),
		robots: { index: false, follow: false },
		// The token is in the URL, so don't hand it to the next page as a referrer.
		referrer: "no-referrer",
	};
}

// The signed-out redirect to sign-in runs in the route's beforeLoad (requireSlackLinkSession).
export default function SlackLinkPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ token?: string | string[] }>;
}) {
	const { locale: localeValue } = use(params);
	const { token: rawToken } = use(searchParams);
	const locale = slackLinkLocale(localeValue);
	const token = slackLinkToken(rawToken);
	const t = useTranslations("SettingsUI.slack.link");

	return (
		<div className="container mx-auto flex w-full min-h-0 flex-1 flex-col justify-center px-4 py-10">
			<div className="mx-auto w-full max-w-lg">
				<SlackLinkConfirm
					token={token}
					locale={locale}
					copy={{
						title: t("title"),
						description: t("description"),
						warning: t("warning"),
						confirm: t("confirm"),
						confirming: t("confirming"),
						missingToken: t("missingToken"),
						missingTokenTitle: t("failedTitle"),
						close: t("close"),
					}}
				/>
			</div>
		</div>
	);
}
