import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import CompatibilityClient from "./CompatibilityClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.internalTools");
	return {
		title: t("gatewayCompatibilityTitle"),
		description: t("gatewayCompatibilityDescription"),
		robots: { index: false, follow: false },
	};
}

export default async function CompatibilityPage() {
	await requireInternalAdmin();

	return <CompatibilityClient />;
}
