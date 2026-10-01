import ProviderSettingsContent from "./ProviderSettingsContent";
import { notFound } from "next/navigation";
export const metadata = { title: "Provider settings - Phaseo", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
	const { section } = await params;
	if (!["models", "review", "integrations"].includes(section)) notFound();
	return <ProviderSettingsContent section={section} />;
}
