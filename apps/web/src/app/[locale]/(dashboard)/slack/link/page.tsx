import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { localizeAuthPath } from "@/lib/auth/localized-paths";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { SLACK_LINK_TOKEN_PATTERN } from "@/components/(gateway)/settings/slack/slackAgentForm";
import SlackLinkConfirm from "./SlackLinkConfirm";

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

export default async function SlackLinkPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ token?: string | string[] }>;
}) {
	const [{ locale: localeValue }, { token: rawToken }] = await Promise.all([params, searchParams]);
	const locale = (isPublicLocale(localeValue) ? localeValue : "en-GB") as PublicLocale;
	const token = typeof rawToken === "string" && SLACK_LINK_TOKEN_PATTERN.test(rawToken) ? rawToken : "";
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) {
		const back = `${localizeAuthPath(locale, "/slack/link")}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
		redirect(`${localizeAuthPath(locale, "/sign-in")}?returnUrl=${encodeURIComponent(back)}`);
	}
	const t = await getTranslations({ locale, namespace: "SettingsUI.slack.link" });

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
