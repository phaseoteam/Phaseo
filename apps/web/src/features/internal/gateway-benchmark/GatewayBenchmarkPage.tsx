import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getLocale, getTranslations } from "@/i18n/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import GatewayBenchmarkClient from "./GatewayBenchmarkClient";

export async function getGatewayBenchmarkMetadata(): Promise<PageMetadata> {
	const locale = await getLocale();
	const t = await getTranslations("Product.gatewayBenchmark");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/internal/gateway-benchmark",
		title: t("metadataTitle"),
		description: t("metadataDescription"),
	});
}

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad.
export default function GatewayBenchmarkPage() {
	return <GatewayBenchmarkClient />;
}
