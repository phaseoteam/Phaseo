import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import ModelsPageClient from "@/components/(data)/models/Models/ModelsPageClient";
import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";
import { resolveModelsCatalogueVersion } from "@/lib/models/catalogueVersion";
import { buildMetadata } from "@/lib/seo";
import { fetchServerProviderCatalogPreviews } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
import { createHash } from "node:crypto";

export const metadata: Metadata = buildMetadata({
	title: "Models",
	description:
		"Browse models with an active Phaseo Gateway route by default, then compare providers, modalities, benchmarks, and pricing.",
	path: "/models",
	keywords: [
		"AI models",
		"compare AI models",
		"AI model pricing",
		"AI benchmarks",
		"AI providers",
	],
});

async function ModelsPageContent() {
	await connection();
	const [catalogueVersion, initialProviderPreviews] = await Promise.all([
		resolveModelsCatalogueVersion(),
		fetchServerProviderCatalogPreviews(),
	]);
	const previewCacheScope = initialProviderPreviews.length === 0
		? "public"
		: createHash("sha256").update(JSON.stringify(initialProviderPreviews.map((preview) => [preview.provider_slug, preview.model_id, preview.created_at]))).digest("hex").slice(0, 16);
	return (
		<ModelsPageClient
			catalogueVersion={catalogueVersion}
			initialProviderPreviews={initialProviderPreviews}
			previewCacheScope={previewCacheScope}
		/>
	);
}

export default function ModelsPage() {
	return (
		<Suspense fallback={<ModelsPageSkeleton />}>
			<ModelsPageContent />
		</Suspense>
	);
}
