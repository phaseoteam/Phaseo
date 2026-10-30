import { createServerFn } from "@tanstack/react-start";

/** The games preview is behind a flag (@/lib/flags), so the check runs on the server. */
export const getCatalogueGamesEnabled = createServerFn({ method: "GET" }).handler(async () => {
	const { catalogueGamesEnabled } = await import("@/lib/games/preview");
	return catalogueGamesEnabled();
});
