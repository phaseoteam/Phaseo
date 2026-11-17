import { createContext, useContext } from "react";

/**
 * Catalogue model ids the header workspace's rules leave out, so model rows can say "Blocked by your workspace".
 * Provided by ModelsDisplay for signed-in viewers; empty otherwise (nothing is tagged).
 */
export const CatalogueModelAccessContext = createContext<ReadonlySet<string>>(new Set());

export function useIsBlockedByWorkspace(modelId: string | null | undefined): boolean {
	const blocked = useContext(CatalogueModelAccessContext);
	return Boolean(modelId) && blocked.has(modelId!);
}
