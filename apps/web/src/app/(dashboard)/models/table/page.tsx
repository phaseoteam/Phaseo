import type { Metadata } from "next";
import ModelsTablePageClient from "@/components/(data)/models/Models/ModelsTablePageClient";
import { resolveModelsCatalogueVersion } from "@/lib/models/catalogueVersion";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { toAccountQueryScope } from "@/lib/query/queryKeys";

export const metadata: Metadata = {
	title: "Models table view",
	description:
		"Internal table layout for browsing Phaseo model records in bulk with dense columns, sortable metadata, and quick cross-provider comparisons.",
	robots: {
		index: false,
		follow: true,
	},
};

export default async function ModelsTablePage() {
	const [catalogueVersion, accountContext] = await Promise.all([
		resolveModelsCatalogueVersion(),
		getServerAccountContext(),
	]);
	return (
		<ModelsTablePageClient
			catalogueVersion={catalogueVersion}
			accountQueryScope={toAccountQueryScope(accountContext)}
		/>
	);
}
