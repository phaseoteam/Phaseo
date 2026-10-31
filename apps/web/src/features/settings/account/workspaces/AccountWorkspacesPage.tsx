import { getTranslations } from "@/i18n/server";
import WorkspacesContent from "./WorkspacesContent";
export async function getAccountWorkspacesMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.workspaces")} - ${t("settingsPageCopy.accountScope")}` };
}
// Provider-mode accounts are redirected to /settings/account/providers in the route's beforeLoad.
export default function Page() {
	return <WorkspacesContent />;
}
