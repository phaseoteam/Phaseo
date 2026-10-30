import { useLocale } from "next-intl";
import { redirect } from "next/navigation";

export default function ChatAudioPage() {
	const locale = useLocale();
	redirect(locale === "en-GB" ? "/chat/speech" : `/${locale}/chat/speech`);
}
