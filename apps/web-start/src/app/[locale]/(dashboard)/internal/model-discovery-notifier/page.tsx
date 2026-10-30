import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import NotifierClient from "./NotifierClient";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.internalTools");
	return {
		title: t("modelDiscoveryNotifierTitle"),
		description: t("modelDiscoveryNotifierDescription"),
		robots: { index: false, follow: false },
	};
}

export default async function InternalModelDiscoveryNotifierPage() {
	await requireInternalAdmin();

	return <NotifierClient />;
}
