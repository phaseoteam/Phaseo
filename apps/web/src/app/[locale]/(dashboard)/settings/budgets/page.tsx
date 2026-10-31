import { getTranslations } from "@/i18n/server";
import BudgetsContent from "./BudgetsContent";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.budgets")} - ${t("headers.settings")}` };
}

export default function BudgetsPage() { return <BudgetsContent />; }
