import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import GuardrailsSettingsClient from "@/components/(gateway)/settings/guardrails/GuardrailsSettingsClient";
import { fetchSettingsGuardrailsInitialData } from "@/lib/fetchers/internal/fetchSettingsGuardrailsInitialData";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Shield } from "lucide-react";

export const metadata = {
	title: "Guardrails - Settings",
};

export default function GuardrailsSettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Guardrails"
				description="Create per-key guardrails: budgets, provider/model restrictions, and ZDR rules."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<GuardrailsSettingsContent />
			</Suspense>
		</div>
	);
}

async function GuardrailsSettingsContent() {
	const initialData = await fetchSettingsGuardrailsInitialData();

	if (!initialData.workspaceId) {
		return (
			<Empty className="rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Shield className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>Select a workspace</EmptyTitle>
					<EmptyDescription>
						Choose a workspace to view and manage its guardrails.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<GuardrailsSettingsClient
			providers={initialData.providers}
			activeProviderModels={initialData.activeProviderModels}
			keys={initialData.keys}
			guardrails={initialData.guardrails}
			guardrailKeyIdsByGuardrailId={initialData.guardrailKeyIdsByGuardrailId}
		/>
	);
}

