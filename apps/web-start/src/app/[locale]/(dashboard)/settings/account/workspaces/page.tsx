import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import WorkspacesContent from "./WorkspacesContent";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.workspaces")} - ${t("settingsPageCopy.accountScope")}` };
}
export default async function Page() {
	if ((await fetchInternalAuthHeaderData()).providerMode) redirect({ href: "/settings/account/providers", locale: await getLocale() });
	return <WorkspacesContent />;
}
