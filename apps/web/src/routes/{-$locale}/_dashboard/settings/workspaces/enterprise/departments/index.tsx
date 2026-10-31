import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import EnterpriseDepartmentsPage, { getEnterpriseDepartmentsMetadata } from "@/features/settings/workspaces/enterprise/departments/EnterpriseDepartmentsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getEnterpriseDepartmentsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/enterprise/departments/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: EnterpriseDepartmentsPage,
});
