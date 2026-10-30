import ProviderSettingsContent from "@/app/(dashboard)/settings/provider/[section]/ProviderSettingsContent";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("internalMainCopy.providerSettings")} - Phaseo`, robots: { index: false, follow: false } };
}
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
	const { section } = await params;
	if (!["models", "review", "integrations"].includes(section)) notFound();
	return <ProviderSettingsContent section={section} />;
}
