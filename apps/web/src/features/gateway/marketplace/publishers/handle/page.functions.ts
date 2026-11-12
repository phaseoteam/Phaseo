import { createServerFn } from "@tanstack/react-start";

/**
 * Publisher pages exist only for known handles; aliases redirect to the
 * canonical handle. Decided before rendering (route beforeLoad).
 */
export const resolveMarketplacePublisher = createServerFn({ method: "GET" })
	.validator((handle: string) => handle)
	.handler(async ({ data: handle }) => {
		const { fetchFrontendMarketplacePresets } = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		const normalizedHandle = decodeURIComponent(handle).trim().toLowerCase();
		const marketplacePresets = await fetchFrontendMarketplacePresets();
		const matchedPublisher = marketplacePresets.find((preset) => preset.publisher.handle.toLowerCase() === normalizedHandle || preset.publisher.aliases?.some((alias) => alias.toLowerCase() === normalizedHandle))?.publisher;
		if (matchedPublisher && matchedPublisher.handle.toLowerCase() !== normalizedHandle) {
			return { redirectTo: `/gateway/marketplace/publishers/${encodeURIComponent(matchedPublisher.handle)}`, found: true };
		}
		const found = marketplacePresets.some((preset) => preset.publisher.handle.toLowerCase() === normalizedHandle);
		return { redirectTo: null, found };
	});
