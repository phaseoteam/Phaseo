import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import TransactionsContent from "./TransactionsContent";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("transactions") };
}

export default function TransactionsPage() { return <TransactionsContent />; }
