import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import PrivateModelEditor from "@/components/(gateway)/settings/private-models/PrivateModelEditor";
import { fetchSettingsPrivateModels } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";
import { fetchFrontendAPIProviders, fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
export const metadata = { title: "New Private Model - Settings" };
export default async function NewPrivateModelPage() {
	const data = await fetchSettingsPrivateModels();
	if (!data.workspaceId) return <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">Select a workspace to manage private models.</div>;
	if (!data.workspaceNamespace) return <div className="rounded-xl border p-6 text-sm text-muted-foreground">This workspace does not have a model namespace.</div>;
	if (!data.canManage) return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Only workspace owners and admins can add private models.</div>;
	const [models, providers] = await Promise.all([fetchFrontendModels().catch(() => []), fetchFrontendAPIProviders().catch(() => [])]);
	return <div className="space-y-6"><SettingsPageHeader title="New Private Model" description="Connect an OpenAI-compatible endpoint to this workspace." meta={<Badge variant="outline">Beta</Badge>} actions={<ProductFeedbackButton surface="settings_private_model_editor" prompt="Tell us what is missing or confusing about connecting a private model." context={{ mode: "create" }} />} /><PrivateModelEditor mode="create" workspaceNamespace={data.workspaceNamespace} catalogModels={models.map((item) => ({ id: item.model_id, name: item.name }))} providers={providers.map((item) => ({ id: item.api_provider_id, name: item.api_provider_name }))} /></div>;
}
