import type { Metadata } from "next";
import { ScopedMessages, type ScopedLayoutProps } from "@/components/i18n/ScopedMessages";

export const metadata: Metadata = {
	title: "Internal",
	robots: {
		index: false,
		follow: false,
	},
};

export default function InternalLayout({
	children,
	params,
}: ScopedLayoutProps) {
	return <ScopedMessages params={params} namespaces={["SettingsUI", "Product", "Catalogue"]}>{children}</ScopedMessages>;
}
