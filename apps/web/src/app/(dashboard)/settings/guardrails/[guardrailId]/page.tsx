import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import GuardrailEditorPage from "@/components/(gateway)/settings/guardrails/GuardrailEditorPage";

export const metadata = {
	title: "Guardrail - Settings",
};

export default function GuardrailDetailPage({
	params,
}: {
	params: { guardrailId: string };
}) {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Guardrail"
				description="Edit an existing guardrail policy."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<GuardrailEditorPage mode="edit" guardrailId={params.guardrailId} />
			</Suspense>
		</div>
	);
}
