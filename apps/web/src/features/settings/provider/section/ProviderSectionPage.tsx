import { useParams } from "@tanstack/react-router";
import ProviderSettingsContent from "./ProviderSettingsContent";
import { notFound } from "@/lib/navigation";
import { getTranslations } from "@/i18n/server";
export async function getProviderSectionMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("internalMainCopy.providerSettings")} - Phaseo`, robots: { index: false, follow: false } };
}
export default function ProviderSectionPage() {
	const { section } = useParams({ from: "/{-$locale}/_dashboard/settings/provider/$section/" });
	if (!["models", "review", "integrations"].includes(section)) notFound();
	return <ProviderSettingsContent section={section} />;
}
