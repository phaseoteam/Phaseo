"use server";

import { getTranslations } from "@/i18n/server";
import { isPublicLocale } from "@/i18n/routing";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { SLACK_LINK_TOKEN_PATTERN, slackLinkErrorKey } from "@/components/(gateway)/settings/slack/slackAgentForm";

export type SlackLinkResult = { ok: boolean; title: string; message: string };

/** Confirms a link token from the Slack agent for the signed-in user, and says how it went. */
export async function confirmSlackLink(token: string, localeValue: string): Promise<SlackLinkResult> {
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
}
