import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CompatibilityClient from "./CompatibilityClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.internalTools");
	return {
		title: t("gatewayCompatibilityTitle"),
		description: t("gatewayCompatibilityDescription"),
		robots: { index: false, follow: false },
	};
}

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad.
export default function CompatibilityPage() {
	return <CompatibilityClient />;
}
