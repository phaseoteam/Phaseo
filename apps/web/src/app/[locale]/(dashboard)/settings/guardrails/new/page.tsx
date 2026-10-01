import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import GuardrailEditorPage from "@/components/(gateway)/settings/guardrails/GuardrailEditorPage";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("newGuardrail") };
}

export default function NewGuardrailPage() {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<GuardrailEditorPage mode="create" />
		</Suspense>
	);
}
