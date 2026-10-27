"use client";
import { useTranslations } from "next-intl";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import KeySecurityClient from "@/components/(gateway)/settings/security/KeySecurityClient";
import type { SettingsKeySecurityInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default withSettingsResource("key-security", function SecurityContent({ initialData }: { initialData: SettingsKeySecurityInitialData }) {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader title={t("keySecurity.title")} description={t("keySecurity.description")} />
			<KeySecurityClient data={initialData} />
		</div>
	);
});
