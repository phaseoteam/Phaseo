import ProviderOnboardingContent from "./ProviderOnboardingContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.providerOnboarding")} - ${t("headers.settings")}` };
}
export default function Page() { return <ProviderOnboardingContent />; }
