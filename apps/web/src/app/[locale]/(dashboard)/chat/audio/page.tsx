import { useLocale } from "@/i18n/react";
import { redirect } from "@/lib/navigation";

export default function ChatAudioPage() {
	const locale = useLocale();
	redirect(locale === "en-GB" ? "/chat/speech" : `/${locale}/chat/speech`);
}
