import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import TransactionsContent from "./TransactionsContent";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("transactions") };
}

export default function TransactionsPage() { return <TransactionsContent />; }
