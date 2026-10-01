import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Gamepad2, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProfileGameSummary } from "@/lib/fetchers/profile/types";
import { GAME_INFO, GAME_KEYS } from "@/lib/games/types";

function formatLastPlayed(
	value: string | null,
	translate: (key: string) => string,
	locale: string,
): string {
	if (!value) return translate("Not played yet");
	return `${translate("Last played")} ${new Date(value).toLocaleDateString(locale, {
		month: "short",
		day: "numeric",
		year: "numeric",
	})}`;
}

export function ProfileGames({ summary }: { summary: ProfileGameSummary | null }) {
	const t = useTranslations("SettingsUI");
	const gamesT = useTranslations("Product.games");
	const locale = useLocale();
	const s = (key: string) => t(`strings.${key}` as never);
	const gameResults = new Map((summary?.games ?? []).map((game) => [game.game, game]));
	const metrics = [
		[s("Played"), summary?.totalPlayed ?? 0],
		[s("Wins"), summary?.totalWins ?? 0],
		[s("Streak"), `${summary?.currentStreak ?? 0}d`],
		[s("Average Score"), `${summary?.averageScore ?? 0}%`],
	] as const;

	return (
		<section className="px-4 pb-8 sm:px-6 lg:px-8" aria-labelledby="catalogue-games-title">
			<div className="border-t border-border pt-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h2 id="catalogue-games-title" className="flex items-center gap-2 text-lg font-semibold text-foreground">
							<Gamepad2 className="size-4" />
							{s("Catalogue Games")}
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{s("Daily results from your signed-in games, grouped by game.")}
						</p>
					</div>
					<Button asChild variant="outline" className="w-fit rounded-lg">
						<Link href="/games">{s("Play Today")}</Link>
					</Button>
				</div>

				<div className="mt-5 grid grid-cols-2 border-y border-border py-4 text-sm sm:grid-cols-4 sm:divide-x sm:divide-border">
					{metrics.map(([label, value], index) => (
						<div key={label} className={index % 2 === 0 ? "pr-4 sm:px-4 sm:first:pl-0" : "pl-4 sm:px-4"}>
							<div className="text-xs text-muted-foreground">{label}</div>
							<div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
						</div>
					))}
				</div>

				<div className="divide-y divide-border">
					{GAME_KEYS.map((gameKey) => {
						const info = GAME_INFO[gameKey];
						const result = gameResults.get(gameKey);
						return (
							<Link
								key={gameKey}
								href={info.path}
								className="group grid gap-4 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2 font-medium text-foreground">
										{gamesT(info.titleKey)}
										<ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-1" />
									</div>
									<p className="mt-1 text-sm text-muted-foreground">{gamesT(info.descriptionKey)}</p>
										<p className="mt-1 text-xs text-muted-foreground">{formatLastPlayed(result?.lastPlayedAt ?? null, s, locale)}</p>
								</div>
								<div className="grid grid-cols-3 gap-5 text-sm sm:min-w-64">
									<div>
										<div className="text-xs text-muted-foreground">{s("Played")}</div>
										<div className="mt-1 font-semibold text-foreground">{result?.played ?? 0}</div>
									</div>
									<div>
										<div className="flex items-center gap-1 text-xs text-muted-foreground"><Trophy className="size-3" />{s("Wins")}</div>
										<div className="mt-1 font-semibold text-foreground">{result?.wins ?? 0}</div>
									</div>
									<div>
										<div className="text-xs text-muted-foreground">{s("Best Score")}</div>
										<div className="mt-1 font-semibold text-foreground">{result?.bestScore ?? 0}%</div>
									</div>
								</div>
							</Link>
						);
					})}
				</div>
			</div>
		</section>
	);
}
