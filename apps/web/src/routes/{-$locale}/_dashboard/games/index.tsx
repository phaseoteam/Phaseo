import { createFileRoute } from "@tanstack/react-router";
import GamesPage from "@/features/games/GamesPage";
import { getCatalogueGamesEnabled } from "@/features/games/page.functions";
import { notFound } from "@/lib/navigation";

export const Route = createFileRoute("/{-$locale}/_dashboard/games/")({
	beforeLoad: async () => {
		if (!(await getCatalogueGamesEnabled())) notFound();
	},
	component: GamesPage,
});
