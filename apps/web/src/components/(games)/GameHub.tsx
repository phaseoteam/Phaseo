import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Gauge,
  Swords,
  Target,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GAME_INFO, GAME_KEYS, type GameKey } from "@/lib/games/types";
import { useTranslations } from "next-intl";

const ICONS: Record<GameKey, React.ComponentType<{ className?: string }>> = {
  modele: Target,
  timeline: CalendarClock,
  pricele: CircleDollarSign,
  "head-to-head": Swords,
  sprint: Gauge,
};

export function GameHub() {
	const t = useTranslations("Product.games");
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-5xl [&_[data-slot=button]]:rounded-lg">
        <div className="mb-10 w-full">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {t("title")}
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_KEYS.map((game) => {
            const Icon = ICONS[game];
            const info = GAME_INFO[game];
            return (
              <Link
                key={game}
                href={info.path}
                className="group rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <Card className="h-full gap-3 rounded-lg py-4 transition-transform duration-200 [--card-spacing:--spacing(4)] group-hover:-translate-y-1">
                  <CardHeader>
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-foreground text-background">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-xl">{t(info.titleKey)}</CardTitle>
                    <CardDescription className="leading-6">
                      {t(info.descriptionKey)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center gap-2 font-medium">
                    {t("play")} {" "}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
