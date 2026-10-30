import { getLocale } from "next-intl/server";
import { getSettingsMessages } from "@/i18n/settings";
import type { PublicLocale } from "@/i18n/routing";
import ProfileContent from "./ProfileContent";
export async function generateMetadata() {
	const messages = getSettingsMessages(await getLocale() as PublicLocale);
	return { title: `${messages.pages.profile} - ${messages.pages.settings}` };
}
export default function Page() { return <ProfileContent />; }
