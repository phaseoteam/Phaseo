import { useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import { Link } from "@/i18n/navigation";
import { getModelDisplayName, getModelMetadataEntry, getModelDetailsHref, type ModelMetadataMap } from "../../usage/model-display";

export function WorkspaceUserModelIdentity({ modelId, metadata, linked = true }: { modelId: string | null; metadata: ModelMetadataMap; linked?: boolean }) {
	const t = useTranslations("SettingsUI");
	const model = getModelMetadataEntry(modelId, metadata);
	const name = modelId && modelId !== "unknown" && !/^[0-9a-f-]{36}$/i.test(modelId)
		? getModelDisplayName(modelId, metadata)
		: t("teams.unknown");
	const logoId = model?.organisationId ?? (modelId?.includes("/") ? modelId.split("/")[0] : "");
	const href = linked && model ? getModelDetailsHref(modelId, metadata) : null;
	return <div className="flex min-w-0 items-center gap-2 font-medium">
		<Logo id={logoId} alt="" width={16} height={16} className="size-4 shrink-0 object-contain" />
		{href ? <Link href={href} className="truncate font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground">{name}</Link> : <span className="truncate">{name}</span>}
	</div>;
}
