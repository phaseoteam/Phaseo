import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { notFound } from "@/lib/navigation";
import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useTranslations } from "@/i18n/react";
import { GameExperience } from "@/components/(games)/GameExperience";
import { GAME_INFO, isGameKey } from "@/lib/games/types";
import type { PublicLocale } from "@/i18n/routing";

export async function getGameMetadata({
  params,
}: RouteMetadataInput): Promise<PageMetadata> {
  const { locale, game } = params;
  if (!isGameKey(game)) return {};
  const t = await getTranslations({
    locale: locale as PublicLocale,
    namespace: "Product.games",
  });
  return {
    title: t(GAME_INFO[game].titleKey),
    description: t(GAME_INFO[game].descriptionKey),
  };
}

// catalogueGamesEnabled() and the game key are also checked in the route's
// beforeLoad, so unknown games 404 before rendering.
function GamePageContent() {
  const { game } = useParams({ from: "/{-$locale}/_dashboard/games/$game/" });
  if (!isGameKey(game)) notFound();
  return <GameExperience game={game} />;
}

export default function GamePage() {
  const t = useTranslations("Product.gamesDetail");
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-12">
          <div className="mx-auto max-w-6xl animate-pulse text-sm text-muted-foreground">
            {t("preparing")}
          </div>
        </main>
      }
    >
      <GamePageContent />
    </Suspense>
  );
}
