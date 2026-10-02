import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SpawnClient from "@/components/(experiments)/SpawnClient";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";

export async function generateMetadata(): Promise<Metadata> {
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
