import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import KeyDetailPage, { getKeyDetailMetadata } from "@/features/settings/keys/keyName/KeyDetailPage";
import { notFound } from "@/lib/navigation";
import { redirect } from "@/i18n/navigation";
import { keyDetailQuery } from "@/features/settings/keys/keyName/keyDetail.functions";
import { keyDetailHref, matchesKeyRouteName } from "@/components/(gateway)/settings/keys/keyDetailHref";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getKeyDetailMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/keys/$keyName/")({
	beforeLoad: async ({ context, params, search }) => {
		const locale = params.locale ?? "en-GB";
		const query = search as Record<string, unknown>;
		const result = await context.queryClient.ensureQueryData(keyDetailQuery(params.keyName, query.workspaceId, query.prefix));
		if (result.kind === "notFound") notFound();
		if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
		if (result.kind === "ok" && !matchesKeyRouteName(result.data.key.name, params.keyName)) redirect({ href: keyDetailHref(result.data.key), locale });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: KeyDetailPage,
});
