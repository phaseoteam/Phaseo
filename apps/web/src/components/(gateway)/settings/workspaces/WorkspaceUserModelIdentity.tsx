import { useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import { Link } from "@/i18n/navigation";
import { formatModelDisplayName } from "@/lib/models/displayName";
import { getModelMetadataEntry, getModelDetailsHref, type ModelMetadataMap } from "../../usage/model-display";

export function WorkspaceUserModelIdentity({ modelId, metadata, linked = true }: { modelId: string | null; metadata: ModelMetadataMap; linked?: boolean }) {
	const t = useTranslations("SettingsUI");
	const model = getModelMetadataEntry(modelId, metadata);
	const name = modelId && modelId !== "unknown" && !/^[0-9a-f-]{36}$/i.test(modelId)
		? formatModelDisplayName(model?.modelName, modelId)
		: t("teams.unknown");
	const logoId = model?.organisationId ?? (modelId?.includes("/") ? modelId.split("/")[0] : "");
	const href = linked && model ? getModelDetailsHref(modelId, metadata) : null;
	return <div className="flex min-w-0 items-center gap-3">
		<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background"><Logo id={logoId} alt="" width={20} height={20} className="size-5 object-contain" /></div>
		<div className="min-w-0">
			{href ? <Link href={href} className="block break-words font-medium underline-offset-4 hover:underline">{name}</Link> : <p className="break-words font-medium">{name}</p>}
			{model?.organisationName && <p className="mt-0.5 text-xs text-muted-foreground">{model.organisationName}</p>}
		</div>
	</div>;
}
