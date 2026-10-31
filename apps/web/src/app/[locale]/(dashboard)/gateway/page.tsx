import { useLocale } from "@/i18n/react";
import { permanentRedirect } from "@/lib/navigation";

export default function GatewayMarketingPageRedirect() {
	const locale = useLocale();
	permanentRedirect(locale === "en-GB" ? "/" : `/${locale}`);
}
