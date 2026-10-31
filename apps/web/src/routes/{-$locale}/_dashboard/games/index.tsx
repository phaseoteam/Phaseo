// Next: src/app/[locale]/(dashboard)/games/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page from "@/app/[locale]/(dashboard)/games/page";
import { getCatalogueGamesEnabled } from "@/app/[locale]/(dashboard)/games/page.functions";
import { notFound } from "@/lib/navigation";


export const Route = createFileRoute("/{-$locale}/_dashboard/games/")({
	beforeLoad: async () => {
		if (!(await getCatalogueGamesEnabled())) notFound();
	},
	component: nextPageComponent(Page),
});
