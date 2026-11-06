import { getTranslations } from "@/i18n/server";
import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import GuardrailEditorPage from "@/components/(gateway)/settings/guardrails/GuardrailEditorPage";

export async function getGuardrailMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("guardrail") };
}

export default function GuardrailDetailPage() {
	const params = useParams({ from: "/{-$locale}/_dashboard/settings/guardrails/$guardrailId/" });
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Guardrail"
				titleKey="headers.guardrail"
				description="Edit an existing guardrail policy."
				descriptionKey="headers.guardrailDescription"
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<GuardrailEditorPage mode="edit" guardrailId={params.guardrailId} />
			</Suspense>
		</div>
	);
}
