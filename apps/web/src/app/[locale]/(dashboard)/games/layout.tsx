import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

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
