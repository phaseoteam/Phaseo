import AccountDetailsClient from "./AccountDetailsClient";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageCopy.accountScope")} - ${t("headers.settings")}` };
}
export default function AccountDetailsPage() { return <AccountDetailsClient />; }
