import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, type RouteMetadataInput, toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import RedeemPage, { getRedeemMetadata } from "@/features/redeem/RedeemPage";
import { defaultLocale } from "@/i18n/locales";
import { redeemCodeFromSearch, redeemPageQuery } from "@/features/redeem/redeem.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getRedeemMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/redeem/")({
	// Signed-out visitors go to sign-in before rendering.
	// The query throws that redirect; the page reads the cached data.
	beforeLoad: async ({ context, params, search }) => {
		const locale = params.locale ?? defaultLocale;
		const code = redeemCodeFromSearch((search as Record<string, unknown>).code);
		await context.queryClient.ensureQueryData(redeemPageQuery(locale, code));
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: RedeemPage,
});
