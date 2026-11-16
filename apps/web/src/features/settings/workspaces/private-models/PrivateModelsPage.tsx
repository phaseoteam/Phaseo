import { useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import PrivateModelsSection from "@/features/settings/workspaces/private-models/PrivateModelsContent";
import { getTranslations } from "@/i18n/server";
import { FeatureStageBadge } from "@/components/(gateway)/settings/FeatureStageBadge";

export async function getPrivateModelsMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("privateModelsCopy.privateModels")} - ${t("headers.settings")}` };
}

export default function PrivateModelsPage() {
	const t = useTranslations("SettingsUI");
	return <div className="min-w-0 space-y-8">
		<SettingsPageHeader
			title={t("privateModelsCopy.privateModels")}
			description={t("privateModelsCopy.privateModelsHelp")}
			meta={<FeatureStageBadge stage="beta" />}
			actions={<ProductFeedbackButton surface="settings_private_models" prompt={t("privateModelsCopy.feedbackPrompt")} />}
		/>
		<Suspense fallback={<SettingsSectionFallback />}><PrivateModelsSection /></Suspense>
	</div>;
}
