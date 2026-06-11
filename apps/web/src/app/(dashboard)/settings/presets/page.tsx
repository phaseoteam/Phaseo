import { Suspense } from "react";
import PresetsPanel from "@/components/(gateway)/settings/presets/PresetsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Store } from "lucide-react";
import {
	fetchFrontendAPIProviders,
	fetchFrontendModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchSettingsPresetsInitialData } from "@/lib/fetchers/internal/fetchSettingsPresetsInitialData";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export const metadata = {
	title: "Presets - Settings",
};

export default function PresetsPage() {
	return (
		<div className="space-y-6">
			<Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50">
				<Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
				<AlertTitle className="text-blue-800 dark:text-blue-300">
					Presets for request configuration
				</AlertTitle>
				<AlertDescription className="text-blue-700 dark:text-blue-400">
					Presets are named configurations starting with @ that you can reference
					in your API calls. Save your preferred model, temperature, system
					prompts, and other settings to create reusable request templates.
				</AlertDescription>
			</Alert>

			<SettingsPageHeader
				title="Presets"
				description="Manage reusable request configurations for your API calls."
				meta={<Badge variant="outline">Beta</Badge>}
				actions={
					<>
						<Link
							href="/gateway/marketplace"
							target="_blank"
							rel="noreferrer"
						>
							<Button
								variant="outline"
								size="sm"
								className="flex items-center gap-2"
							>
								<Store className="h-4 w-4" />
								Marketplace
							</Button>
						</Link>
						<Link href="/settings/presets/new">
							<Button
								variant="default"
								size="sm"
								className="flex items-center gap-2"
							>
								<Plus className="h-4 w-4" />
								Create Preset
							</Button>
						</Link>
					</>
				}
			/>

			<Suspense fallback={<SettingsSectionFallback />}>
				<PresetsContent />
			</Suspense>
		</div>
	);
}

async function PresetsContent() {
	const [initialData, models, providers] = await Promise.all([
		fetchSettingsPresetsInitialData(),
		fetchFrontendModels(),
		fetchFrontendAPIProviders(),
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
			initialTeamId={initialData.initialTeamId}
			currentUserId={initialData.currentUserId}
			providers={providers}
		/>
	);
}
