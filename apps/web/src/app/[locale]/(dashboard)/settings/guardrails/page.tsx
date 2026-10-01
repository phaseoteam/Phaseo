import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import Link from "next/link";
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
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.guardrails")} - ${t("headers.settings")}` };
}

export default function GuardrailsSettingsPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<GuardrailsSettingsContent />
			</Suspense>
		</div>
	);
}

async function GuardrailsSettingsContent() {
	const t = await getTranslations("SettingsUI");
	const initialData = await fetchSettingsGuardrailsInitialData();
	const header = (
		<SettingsPageHeader
			title="Guardrails"
			titleKey="headers.guardrails"
			description="Set workspace policies for members and API keys."
			descriptionKey="headers.guardrailsDescription"
			meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
			actions={(
				<>
					{initialData.canManageGuardrails ? <Button asChild type="button" className="rounded-md">
						<Link href="/settings/guardrails/new">
							<Plus className="h-4 w-4" />
							{t("settingsPageCopy.guardrailNew")}
						</Link>
					</Button> : null}
					<ProductFeedbackButton
						surface="settings_guardrails"
						prompt={t("settingsPageCopy.guardrailFeedback")}
					/>
				</>
			)}
		/>
	);

	if (!initialData.workspaceId) {
		return (
			<div className="space-y-6">
				{header}
				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Shield className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>{t("settingsCopy.guardrails.selectWorkspace")}</EmptyTitle>
					<EmptyDescription>
						{t("settingsPageCopy.guardrailsWorkspaceBody")}
					</EmptyDescription>
				</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{header}
		<GuardrailsSettingsClient
			canManageGuardrails={initialData.canManageGuardrails}
			providers={initialData.providers}
			activeProviderModels={initialData.activeProviderModels}
			keys={initialData.keys}
			guardrails={initialData.guardrails}
			guardrailKeyIdsByGuardrailId={initialData.guardrailKeyIdsByGuardrailId}
			guardrailMemberIdsByGuardrailId={initialData.guardrailMemberIdsByGuardrailId}
		/>
		</div>
	);
}
