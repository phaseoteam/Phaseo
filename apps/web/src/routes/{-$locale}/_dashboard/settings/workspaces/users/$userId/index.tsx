// Next: src/app/[locale]/(dashboard)/settings/workspaces/users/[userId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/workspaces/users/[userId]/page";
import { notFound } from "@/lib/navigation";
import { redirect } from "@/i18n/navigation";
import { workspaceUserQuery } from "@/app/[locale]/(dashboard)/settings/workspaces/users/[userId]/workspaceUser.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/users/$userId/")({
	beforeLoad: async ({ context, params, search }) => {
		const locale = params.locale ?? "en-GB";
		const query = search as Record<string, unknown>;
		const result = await context.queryClient.ensureQueryData(workspaceUserQuery(params.userId, query.workspaceId, query.keyPage));
		if (result.kind === "self") redirect({ href: "/settings/profile", locale });
		if (result.kind === "notFound") notFound();
		if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: { params, search: location.search as Record<string, unknown> } })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
