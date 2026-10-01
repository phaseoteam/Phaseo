import GuardrailsContent from "./GuardrailsContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.guardrails")} - ${t("headers.settings")}` };
}
export default function GuardrailsPage() { return <GuardrailsContent />; }
