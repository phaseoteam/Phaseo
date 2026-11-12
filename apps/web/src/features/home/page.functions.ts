// Home page: the hero variant and enterprise preview come from @/lib/flags
// (server only); model prices are a public fetch that runs in both places.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export const getHomePageFlags = createServerFn({ method: "GET" }).handler(async () => {
	const [{ getGatewayHeroVariant }, { enterpriseSelfServePreviewEnabled }] = await Promise.all([
		import("@/lib/flags/gatewayHero"),
		import("@/lib/flags"),
	]);
	const [heroVariant, showEnterprisePreview] = await Promise.all([
		getGatewayHeroVariant(),
		enterpriseSelfServePreviewEnabled(),
	]);
	return { heroVariant, showEnterprisePreview };
});

export const homePageFlagsQuery = () =>
	queryOptions({
		queryKey: ["home-page-flags"],
		queryFn: () => getHomePageFlags(),
	});
