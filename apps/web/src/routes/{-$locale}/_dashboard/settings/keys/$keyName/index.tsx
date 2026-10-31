// Next: src/app/[locale]/(dashboard)/settings/keys/[keyName]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/keys/[keyName]/page";
import { notFound } from "@/lib/navigation";
import { redirect } from "@/i18n/navigation";
import { keyDetailQuery } from "@/app/[locale]/(dashboard)/settings/keys/[keyName]/keyDetail.functions";
import { keyDetailHref, matchesKeyRouteName } from "@/components/(gateway)/settings/keys/keyDetailHref";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/keys/$keyName/")({
	beforeLoad: async ({ context, params, search }) => {
		const locale = params.locale ?? "en-GB";
		const query = search as Record<string, unknown>;
		const result = await context.queryClient.ensureQueryData(keyDetailQuery(params.keyName, query.workspaceId, query.prefix));
		if (result.kind === "notFound") notFound();
		if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
		if (result.kind === "ok" && !matchesKeyRouteName(result.data.key.name, params.keyName)) redirect({ href: keyDetailHref(result.data.key), locale });
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: { params, search: location.search as Record<string, unknown> } })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
