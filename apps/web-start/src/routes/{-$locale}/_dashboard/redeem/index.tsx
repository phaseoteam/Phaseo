// Next: src/app/[locale]/(dashboard)/redeem/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/redeem/page";
import { defaultLocale } from "@/i18n/locales";
import { redeemCodeFromSearch, redeemPageQuery } from "@/app/[locale]/(dashboard)/redeem/redeem.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/redeem/")({
	// Next: the page redirected signed-out visitors to sign-in before rendering.
	// The query throws that redirect; the page reads the cached data.
	beforeLoad: async ({ context, params, search }) => {
		const locale = params.locale ?? defaultLocale;
		const code = redeemCodeFromSearch((search as Record<string, unknown>).code);
		await context.queryClient.ensureQueryData(redeemPageQuery(locale, code));
	},
	loader: async ({ params, location }) => ({ metadata: await routeMetadata({ data: { params, search: location.search as Record<string, unknown> } }) }),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
