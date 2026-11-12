import { createServerFn } from "@tanstack/react-start";
import { serverAction } from "@/lib/serverFn/actionMiddleware";
import { getTranslations } from "@/i18n/server";
import { isPublicLocale } from "@/i18n/routing";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { SLACK_LINK_TOKEN_PATTERN, slackLinkErrorKey } from "@/components/(gateway)/settings/slack/slackAgentForm";

export type SlackLinkResult = { ok: boolean; title: string; message: string };

/** Confirms a link token from the Slack agent for the signed-in user, and says how it went. */
export const confirmSlackLink = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { token: string; localeValue: string }) => input)
	.handler(async ({ data: { token, localeValue } }): Promise<SlackLinkResult> => {
		const locale = isPublicLocale(localeValue) ? localeValue : "en-GB";
		const t = await getTranslations({ locale, namespace: "SettingsUI.slack.link" });
		if (typeof token !== "string" || !SLACK_LINK_TOKEN_PATTERN.test(token)) {
			return { ok: false, title: t("failedTitle"), message: t("errors.invalid") };
		}
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) return { ok: false, title: t("failedTitle"), message: t("errors.signIn") };
		try {
			const result = await fetchAccountWebApi<{ linked: boolean; workspace_name?: string | null; team_name?: string | null }>(
				"/api/account/settings/slack/link",
				accessToken,
				{ method: "POST", body: JSON.stringify({ token }) },
			);
			const message = result.team_name && result.workspace_name
				? t("linked", { team: result.team_name, workspace: result.workspace_name })
				: t("linkedGeneric");
			return { ok: true, title: t("linkedTitle"), message };
		} catch (error) {
			const key = slackLinkErrorKey(error instanceof WebApiError ? error.code : null);
			return { ok: false, title: t("failedTitle"), message: t(`errors.${key}`) };
		}
	});

type SlackLinkPreview = {
	slack_user: { id: string; handle: string | null; real_name: string | null; display_name: string | null };
	team_name: string | null;
	workspace_name: string;
};

/**
 * The Slack account a link token was made for, as Slack names it, shown before the person confirms:
 * a link someone forwarded shows the sender's account, not the reader's. Or why the link can't be used.
 */
export const describeSlackLink = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { token: string; localeValue: string }) => input)
	.handler(async ({ data: { token, localeValue } }): Promise<{ account: string | null; failure: string | null }> => {
		const locale = isPublicLocale(localeValue) ? localeValue : "en-GB";
		const t = await getTranslations({ locale, namespace: "SettingsUI.slack.link" });
		if (typeof token !== "string" || !SLACK_LINK_TOKEN_PATTERN.test(token)) return { account: null, failure: t("errors.invalid") };
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) return { account: null, failure: t("errors.signIn") };
		try {
			const preview = await fetchAccountWebApi<SlackLinkPreview>("/api/account/settings/slack/link/preview", accessToken, {
				method: "POST",
				body: JSON.stringify({ token }),
			});
			const user = preview.slack_user;
			const name = user.display_name || user.real_name || (user.handle ? `@${user.handle}` : null);
			const team = preview.team_name || t("unknownTeam");
			return { account: name ? t("account", { name, id: user.id, team }) : t("accountUnnamed", { id: user.id, team }), failure: null };
		} catch (error) {
			return { account: null, failure: t(`errors.${slackLinkErrorKey(error instanceof WebApiError ? error.code : null)}`) };
		}
	});
