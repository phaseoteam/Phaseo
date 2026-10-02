import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameExperience } from "@/components/(games)/GameExperience";
import { catalogueGamesEnabled } from "@/lib/games/preview";
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

async function GamePageContent({ params }: GamePageProps) {
  if (!(await catalogueGamesEnabled())) notFound();
  const { game } = await params;
  if (!isGameKey(game)) notFound();
  return <GameExperience game={game} />;
}

export default async function GamePage(props: GamePageProps) {
  const t = await getTranslations("Product.gamesDetail");
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
