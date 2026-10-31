// Next: src/app/[locale]/(dashboard)/slack/link/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/slack/link/page";
import { requireSlackLinkSession } from "@/app/[locale]/(dashboard)/slack/link/link.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/slack/link/")({
	// Next: the page sent signed-out visitors to sign-in (keeping the token) before rendering.
	beforeLoad: async ({ params, search }) => {
		const token = (search as Record<string, unknown>).token;
		await requireSlackLinkSession({ data: { locale: params.locale ?? "en-GB", token: typeof token === "string" ? token : "" } });
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: { params, search: location.search as Record<string, unknown> } })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
