import ProviderOnboardingContent from "./ProviderOnboardingContent";
import { getTranslations } from "@/i18n/server";
export async function getAccountProvidersMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.providerOnboarding")} - ${t("headers.settings")}` };
}
export default function Page() { return <ProviderOnboardingContent />; }
