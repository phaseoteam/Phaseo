import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LatencyComparisonClient from "./LatencyComparisonClient";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.latency");
	return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

export default async function LatencyComparisonPage() {
	const authStatus = await fetchInternalAuthStatus();
	if (!authStatus.signedIn) {
		redirect("/sign-in");
	}

	if (!authStatus.isAdmin) {
		redirect("/");
	}

	return <LatencyComparisonClient />;
}
