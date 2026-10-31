import { use } from "react";
import ProviderSettingsContent from "@/app/(dashboard)/settings/provider/[section]/ProviderSettingsContent";
import { notFound } from "@/lib/navigation";
import { getTranslations } from "@/i18n/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("internalMainCopy.providerSettings")} - Phaseo`, robots: { index: false, follow: false } };
}
export default function Page({ params }: { params: Promise<{ section: string }> }) {
	const { section } = use(params);
	if (!["models", "review", "integrations"].includes(section)) notFound();
	return <ProviderSettingsContent section={section} />;
}
