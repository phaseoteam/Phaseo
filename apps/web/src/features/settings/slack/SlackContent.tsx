import { useTranslations } from "@/i18n/react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import SlackAgentSettingsClient from "@/components/(gateway)/settings/slack/SlackAgentSettingsClient";
import type { SlackAgentView } from "@/components/(gateway)/settings/slack/slackAgentForm";
import { Badge } from "@/components/ui/badge";

export default function SlackContent() {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("slack.title")}
				description={t("slack.description")}
				meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
			/>
			<PrivateSettingsQuery<SlackAgentView> path="/api/account/settings/slack">
				{(view) => <SlackAgentSettingsClient view={view} />}
			</PrivateSettingsQuery>
		</div>
	);
}
