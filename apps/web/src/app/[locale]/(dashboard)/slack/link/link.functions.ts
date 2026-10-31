// Signed-out gate for /slack/link: visitors without a session sign in first
// and come back with the same token. Runs from the route's beforeLoad.
import { createServerFn } from "@tanstack/react-start";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { SLACK_LINK_TOKEN_PATTERN } from "@/components/(gateway)/settings/slack/slackAgentForm";

export function slackLinkLocale(localeValue: string | undefined): PublicLocale {
	return (localeValue && isPublicLocale(localeValue) ? localeValue : "en-GB") as PublicLocale;
}

export function slackLinkToken(rawToken: unknown): string {
	return typeof rawToken === "string" && SLACK_LINK_TOKEN_PATTERN.test(rawToken) ? rawToken : "";
}

export const requireSlackLinkSession = createServerFn({ method: "GET" })
	.validator((input: { locale: string; token: string }) => ({ locale: slackLinkLocale(input.locale), token: slackLinkToken(input.token) }))
	.handler(async ({ data: { locale, token } }) => {
		const [{ redirect }, { localizeAuthPath }, { getServerAccountContext }] = await Promise.all([
			import("@/lib/navigation"),
			import("@/lib/auth/localized-paths"),
			import("@/lib/fetchers/internal/serverAccountContext"),
		]);
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) {
			const back = `${localizeAuthPath(locale, "/slack/link")}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
			redirect(`${localizeAuthPath(locale, "/sign-in")}?returnUrl=${encodeURIComponent(back)}`);
		}
		return null;
	});
