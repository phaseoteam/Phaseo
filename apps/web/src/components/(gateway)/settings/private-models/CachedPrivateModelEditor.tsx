"use client";
import { SettingsResourceQuery } from "../PrivateSettingsQuery";
import SettingsPageHeader from "../SettingsPageHeader";
import PrivateModelEditor from "./PrivateModelEditor";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";

export default function CachedPrivateModelEditor({ privateModelId, catalogModels, providers }: {
	privateModelId?: string;
	catalogModels: { id: string; name: string }[];
	providers: { id: string; name: string }[];
}) {
	return <SettingsResourceQuery resource="private-models">{(data) => {
		if (!data.workspaceNamespace) return <p>This workspace does not have a model namespace.</p>;
		if (!data.canManage) return <p>Only workspace owners and admins can change private models.</p>;
		const model = data.models.find((item) => item.id === privateModelId);
		if (privateModelId && !model) return <p>Private model not found.</p>;
		const mode = privateModelId ? "edit" : "create";
		return <div className="space-y-6"><SettingsPageHeader title={model?.name ?? "New Private Model"} description={model ? "Update this workspace model endpoint." : "Connect an OpenAI-compatible endpoint to this workspace."} meta={<Badge variant="outline">Beta</Badge>} actions={<ProductFeedbackButton surface="settings_private_model_editor" prompt="Tell us what is missing or confusing about managing a private model." context={{ mode }} />} /><PrivateModelEditor mode={mode} initialModel={model} workspaceNamespace={data.workspaceNamespace} catalogModels={catalogModels} providers={providers} /></div>;
	}}</SettingsResourceQuery>;
}
