import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import GuardrailEditorPage from "@/components/(gateway)/settings/guardrails/GuardrailEditorPage";

export const metadata = {
	title: "New Guardrail - Settings",
};

export default function NewGuardrailPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="New Guardrail"
				description="Create a new guardrail policy and apply it to one or more API keys."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<GuardrailEditorPage mode="create" />
			</Suspense>
		</div>
	);
}
