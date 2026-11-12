import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { SettingsResourceQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import AccountPrivacySettingsClient from "@/components/(gateway)/settings/account/AccountPrivacySettingsClient";

export async function getRouteAccessMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("strings.Route Access")} - ${t("headers.settings")}` };
}

export function RouteAccessPage() {
	const t = useTranslations("SettingsUI");
	return <div className="w-full max-w-4xl space-y-8">
		<SettingsPageHeader title={t("strings.Route Access")} />
		<SettingsResourceQuery resource="privacy">{(data) => data.workspaceId ? <AccountPrivacySettingsClient
			key={data.workspaceId}
			section="access"
			canManage={data.canManage}
			workspaceId={data.workspaceId}
			policy={data.policy}
			providers={data.providers}
			models={data.models}
		/> : <p>{t("settingsPageCopy.routingWorkspace")}</p>}</SettingsResourceQuery>
	</div>;
}
