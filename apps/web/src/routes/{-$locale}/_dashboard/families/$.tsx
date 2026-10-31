// Next: src/app/[locale]/(dashboard)/families/[...familyId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/families/[...familyId]/page";
import { familyQuery } from "@/app/[locale]/(dashboard)/families/page.queries";
import { notFound } from "next/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/families/$")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown>, splatName: "familyId" } });
		metadataPromise.catch(() => undefined);
		const familyId = (params._splat ?? "").split("/").filter(Boolean).map(decodeURIComponent).join("/");
		if (!(await context.queryClient.ensureQueryData(familyQuery(familyId)))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page, { splatName: "familyId" }),
});
