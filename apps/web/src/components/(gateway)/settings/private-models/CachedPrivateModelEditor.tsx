"use client";
import { useTranslations } from "next-intl";
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
	const t = useTranslations("SettingsUI");
	return <SettingsResourceQuery resource="private-models">{(data) => {
		if (!data.workspaceNamespace) return <p>{t("privateModelsCopy.noNamespace")}</p>;
		if (!data.canManage) return <p>{t("privateModelsCopy.permissionRequired")}</p>;
		const model = data.models.find((item) => item.id === privateModelId);
		if (privateModelId && !model) return <p>{t("privateModelsCopy.notFound")}</p>;
		const mode = privateModelId ? "edit" : "create";
		return <div className="space-y-6"><SettingsPageHeader title={model?.name ?? t("privateModelsCopy.newModel")} description={model ? t("privateModelsCopy.updateEndpoint") : t("privateModelsCopy.connectEndpoint")} meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>} actions={<ProductFeedbackButton surface="settings_private_model_editor" prompt={t("privateModelsCopy.editorFeedback")} context={{ mode }} />} /><PrivateModelEditor mode={mode} initialModel={model} workspaceNamespace={data.workspaceNamespace} catalogModels={catalogModels} providers={providers} /></div>;
	}}</SettingsResourceQuery>;
}
