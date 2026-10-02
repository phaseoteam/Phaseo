import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function ChatAudioPage() {
	const locale = await getLocale();
	redirect(locale === "en-GB" ? "/chat/speech" : `/${locale}/chat/speech`);
}
