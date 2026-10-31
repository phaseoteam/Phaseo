import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Product.games");
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false, nocache: true } };
}

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
