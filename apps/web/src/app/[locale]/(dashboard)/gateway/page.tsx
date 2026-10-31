import { useLocale } from "next-intl";
import { permanentRedirect } from "next/navigation";

export default function GatewayMarketingPageRedirect() {
	const locale = useLocale();
	permanentRedirect(locale === "en-GB" ? "/" : `/${locale}`);
}
