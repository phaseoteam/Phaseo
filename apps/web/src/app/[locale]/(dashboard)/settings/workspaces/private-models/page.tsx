import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";
import PrivateModelsSection from "@/app/(dashboard)/settings/workspaces/private-models/PrivateModelsContent";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("privateModelsCopy.privateModels")} - ${t("headers.settings")}` };
}

export default async function PrivateModelsPage() {
	const t = await getTranslations("SettingsUI");
	return <div className="mx-auto space-y-6">
		<SettingsPageHeader
			title={t("privateModelsCopy.privateModels")}
			description={t("privateModelsCopy.privateModelsHelp")}
			meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
			actions={<ProductFeedbackButton surface="settings_private_models" prompt={t("privateModelsCopy.feedbackPrompt")} />}
		/>
		<Suspense fallback={<SettingsSectionFallback />}><PrivateModelsSection /></Suspense>
	</div>;
}
