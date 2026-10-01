import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import PresetForm from "@/components/(gateway)/settings/presets/PresetForm";
import {
	fetchFrontendAPIProviders,
	fetchFrontendModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchSettingsPresetsInitialData } from "@/lib/fetchers/internal/fetchSettingsPresetsInitialData";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("createPreset") };
}

export default async function NewPresetPage() {
	const t = await getTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<Link
				href="/settings/presets"
				className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ArrowLeft className="mr-2 h-4 w-4" />
				{t("headers.presets")}
			</Link>

			<Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50">
				<Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
				<AlertTitle className="text-blue-800 dark:text-blue-300">
					{t("headers.createNewPreset")}
				</AlertTitle>
				<AlertDescription className="text-blue-700 dark:text-blue-400">
					{t("headers.presetIntro")}
				</AlertDescription>
			</Alert>

			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold">{t("headers.newPreset")}</h1>
						<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>
					</div>
					<p className="text-sm text-muted-foreground mt-1">
						{t("headers.newPresetDescription")}
					</p>
				</div>
			</div>

			<Suspense fallback={<SettingsSectionFallback />}>
				<NewPresetContent />
			</Suspense>
		</div>
	);
}

async function NewPresetContent() {
	const [initialData, models, providers] = await Promise.all([
		fetchSettingsPresetsInitialData(),
		fetchFrontendModels(),
		fetchFrontendAPIProviders(),
	]);

	return (
		<PresetForm
			models={models}
			providers={providers}
			currentUserId={initialData.currentUserId}
			currentTeamId={initialData.initialTeamId}
			workspacePublisher={initialData.workspacePublisher}
		/>
	);
}
