import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "@/components/link";
import PresetEditorContent from "../PresetEditorContent";
import { useSuspenseQueries } from "@tanstack/react-query";
import { settingsApiProvidersQuery, settingsPresetModelsQuery } from "../../catalog.queries";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";

export async function getNewPresetMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("createPreset") };
}

export default function NewPresetPage() {
	const t = useTranslations("SettingsUI");
	return (
		<div className="min-w-0 space-y-8">
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

			<SettingsPageHeader title={t("headers.newPreset")} description={t("headers.newPresetDescription")} meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>} />

			<Suspense fallback={<SettingsSectionFallback />}>
				<NewPresetContent />
			</Suspense>
		</div>
	);
}

function NewPresetContent() {
	const [{ data: models }, { data: providers }] = useSuspenseQueries({
		queries: [settingsPresetModelsQuery(), settingsApiProvidersQuery()],
	});

	return (
		<PresetEditorContent
			models={models}
			providers={providers}
		/>
	);
}
