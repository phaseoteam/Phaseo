import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import PrivateModelEditor from "@/components/(gateway)/settings/private-models/PrivateModelEditor";
import { fetchSettingsPrivateModels } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";
import { fetchFrontendAPIProviders, fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
export const metadata = { title: "Private Model - Settings" };
export default async function PrivateModelPage({ params }: { params: Promise<{ privateModelId: string }> }) {
	const { privateModelId } = await params; const data = await fetchSettingsPrivateModels(); const model = data.models.find((item) => item.id === privateModelId);
	if (!data.workspaceId) return <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">Select a workspace to manage private models.</div>;
	if (!data.workspaceNamespace) return <div className="rounded-xl border p-6 text-sm text-muted-foreground">This workspace does not have a model namespace.</div>;
	if (!data.canManage) return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Only workspace owners and admins can change private models.</div>;
	if (!model) return <div className="rounded-xl border p-6 text-sm text-muted-foreground">Private model not found.</div>;
	const [models, providers] = await Promise.all([fetchFrontendModels().catch(() => []), fetchFrontendAPIProviders().catch(() => [])]);
	return <div className="space-y-6"><SettingsPageHeader title={model.name} description="Update this workspace model endpoint." meta={<Badge variant="outline">Beta</Badge>} actions={<ProductFeedbackButton surface="settings_private_model_editor" prompt="Tell us what is missing or confusing about managing a private model." context={{ mode: "edit" }} />} /><PrivateModelEditor mode="edit" initialModel={model} workspaceNamespace={data.workspaceNamespace} catalogModels={models.map((item) => ({ id: item.model_id, name: item.name }))} providers={providers.map((item) => ({ id: item.api_provider_id, name: item.api_provider_name }))} /></div>;
}
