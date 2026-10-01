import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import PresetsPanel from "@/components/(gateway)/settings/presets/PresetsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, Store } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	fetchFrontendModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchSettingsPresetsInitialData } from "@/lib/fetchers/internal/fetchSettingsPresetsInitialData";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.presetPage");
	return { title: t("metadataTitle") };
}

export default async function PresetsPage() {
	const t = await getTranslations("SettingsUI.presetPage");
	return (
		<div className="space-y-7">
			<Alert className="border-border/80 bg-muted/25">
				<Sparkles className="h-4 w-4 text-muted-foreground" />
				<AlertTitle className="text-foreground">
					{t("introTitle")}
				</AlertTitle>
				<AlertDescription className="max-w-4xl text-muted-foreground">
					{t("introBody")}
				</AlertDescription>
			</Alert>

			<SettingsPageHeader
			title={t("settingsTitle")}
				description={t("settingsDescription")}
				meta={<Badge variant="outline">{t("betaBadge")}</Badge>}
				actions={
					<div className="flex flex-wrap items-center justify-end gap-2">
						<Button asChild variant="default" size="sm" className="h-9 gap-2 rounded-md px-3">
							<Link href="/settings/presets/new">
								<Plus className="h-4 w-4" />
								{t("createButton")}
							</Link>
						</Button>
						<Button asChild variant="outline" size="sm" className="h-9 gap-2 rounded-md px-3">
							<Link href="/gateway/marketplace" target="_blank" rel="noreferrer">
								<Store className="h-4 w-4" />
								{t("marketplaceButton")}
							</Link>
						</Button>
						<ProductFeedbackButton
							surface="settings_presets"
							prompt={t("feedbackPrompt")}
						/>
					</div>
				}
			/>

			<Suspense fallback={<SettingsSectionFallback />}>
				<PresetsContent />
			</Suspense>
		</div>
	);
}

async function PresetsContent() {
	const [initialData, models] = await Promise.all([
		fetchSettingsPresetsInitialData(),
		fetchFrontendModels(),
	]);

	const teamsWithPresets = initialData.teamsWithPresets.map((team) => ({
		...team,
		presets: team.presets.map((preset: any) => ({
			...preset,
			all_models: models,
		})),
	}));

	return (
		<PresetsPanel
			teamsWithPresets={teamsWithPresets}
			currentUserId={initialData.currentUserId}
			workspacePublisherHandle={initialData.workspacePublisher.handle}
		/>
	);
}
