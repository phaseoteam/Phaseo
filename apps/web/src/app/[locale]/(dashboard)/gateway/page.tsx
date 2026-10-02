import { permanentRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function GatewayMarketingPageRedirect() {
	const locale = await getLocale();
	permanentRedirect(locale === "en-GB" ? "/" : `/${locale}`);
}
