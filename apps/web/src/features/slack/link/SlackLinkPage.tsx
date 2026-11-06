import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { useParams, useSearch } from "@tanstack/react-router";
import { defaultLocale } from "@/i18n/locales";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import SlackLinkConfirm from "./SlackLinkConfirm";
import { slackLinkLocale, slackLinkToken } from "./link.functions";

// The Slack agent DMs people a link here (/slack/link?token=…) to connect their
// Slack account to their Phaseo account. Signed-out visitors sign in first and
// come back with the same token. Analytics stays off for visits that start here
// (see isAnalyticsBlockedForPageLoad).

export async function getSlackLinkMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params;
	const t = await getTranslations({ locale: (isPublicLocale(locale) ? locale : "en-GB") as PublicLocale, namespace: "SettingsUI.slack.link" });
	return {
		title: t("metaTitle"),
		robots: { index: false, follow: false },
		// The token is in the URL, so don't hand it to the next page as a referrer.
		referrer: "no-referrer",
	};
}

// The signed-out redirect to sign-in runs in the route's beforeLoad (requireSlackLinkSession).
export default function SlackLinkPage() {
	const { locale: localeValue = defaultLocale } = useParams({ strict: false });
	const { token: rawToken } = useSearch({ from: "/{-$locale}/_dashboard/slack/link/" }) as { token?: string | string[] };
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
