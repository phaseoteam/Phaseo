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
	return <ScopedMessages params={params} namespaces={["Auth", "SettingsUI", "Product", "Catalogue", "Common.ui.apiModelConflicts", "Common.ui.select", "Common.ui.status", "Common.ui.filters", "Common.ui.auditDataTable", "Common.ui.actions", "Common.ui.datePicker", "Common.ui.pricingEditorCopy", "Common.ui.versionedPricing", "Common.ui.modelEditor", "Common.ui.modelCreation", "Common.ui.finalSharedCopy", "Common.ui.linkTypes", "Common.ui.chatComposer", "Common.ui.editorTabs", "Common.ui.benchmarkComparison"]}>{children}</ScopedMessages>;
}
