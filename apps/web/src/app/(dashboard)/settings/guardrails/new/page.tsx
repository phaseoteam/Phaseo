import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import GuardrailEditorPage from "@/components/(gateway)/settings/guardrails/GuardrailEditorPage";

export const metadata = {
	title: "New Guardrail - Settings",
};

export default function NewGuardrailPage() {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<GuardrailEditorPage mode="create" />
		</Suspense>
	);
}
