import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense, use } from "react";
import { useTranslations } from "next-intl";
import { GameExperience } from "@/components/(games)/GameExperience";
import { GAME_INFO, isGameKey } from "@/lib/games/types";
import type { PublicLocale } from "@/i18n/routing";

type GamePageProps = { params: Promise<{ locale: string; game: string }> };

export async function generateMetadata({
  params,
}: GamePageProps): Promise<Metadata> {
  const { locale, game } = await params;
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
function GamePageContent({ params }: GamePageProps) {
  const { game } = use(params);
  if (!isGameKey(game)) notFound();
  return <GameExperience game={game} />;
}

export default function GamePage(props: GamePageProps) {
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
      <GamePageContent {...props} />
    </Suspense>
  );
}
