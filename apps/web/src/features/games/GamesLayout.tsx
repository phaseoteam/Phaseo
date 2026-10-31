import { Outlet } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";

export async function getGamesLayoutMetadata(): Promise<PageMetadata> {
  const t = await getTranslations("Product.games");
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false, nocache: true } };
}

export default function GamesLayout() {
  return <Outlet />;
}
