import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

// The public app leaderboard and usage pages are not search landing pages.
// Curated integration discovery is handled by /works-with instead.
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.apps");
	return { title: t("title"), description: t("description"), robots: { index: false, follow: true } };
}

export default function AppsLayout({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
