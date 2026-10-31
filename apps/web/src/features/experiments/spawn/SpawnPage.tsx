import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import SpawnClient from "@/components/(experiments)/SpawnClient";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";

export async function getSpawnMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.experiments");
	return { title: t("spawnTitle"), description: t("spawnDescription"), keywords: ["Experiments Spawn+", "BYOC", "CLI", "Phaseo"], alternates: { canonical: "/experiments/spawn" } };
}

export default function SpawnPage() {
	return (
		<>
			<ShowFooterStyle />
			<SpawnClient />
		</>
	);
}
