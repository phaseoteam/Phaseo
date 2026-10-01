import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import GatewayBenchmarkClient from "./GatewayBenchmarkClient";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Product.gatewayBenchmark");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/internal/gateway-benchmark",
		title: t("metadataTitle"),
		description: t("metadataDescription"),
	});
}

export default async function GatewayBenchmarkPage() {
	await requireInternalAdmin();

	return <GatewayBenchmarkClient />;
}
