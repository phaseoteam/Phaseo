import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";
import { fetchSettingsPrivateModels } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import { PrivateModelsManager } from "./PrivateModelsManager";

export const metadata = { title: "Private Models - Settings" };

export default async function PrivateModelsPage() {
	return <div className="mx-auto space-y-6">
		<SettingsPageHeader
			title="Private Models"
			description="Connect workspace-only model endpoints to the Phaseo gateway."
			meta={<Badge variant="outline">Beta</Badge>}
			actions={<ProductFeedbackButton surface="settings_private_models" prompt="Tell us what would make Private Models more useful for your workspace." />}
		/>
		<Suspense fallback={<SettingsSectionFallback />}><PrivateModelsSection /></Suspense>
	</div>;
}

async function PrivateModelsSection() {
	const data = await fetchSettingsPrivateModels();
	return <PrivateModelsManager initialModels={data.models} canManage={data.canManage} hasWorkspace={Boolean(data.workspaceId)} />;
}
