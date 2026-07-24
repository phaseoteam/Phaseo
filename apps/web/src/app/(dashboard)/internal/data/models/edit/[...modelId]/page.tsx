import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchAdminCatalogRecord } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { deleteModelAction } from "../../../actions";
import ModelLegacyEditor from "./ModelLegacyEditor";
import ModelRevalidationControls from "./ModelRevalidationControls";

export default async function EditModelPage({
	params,
	searchParams,
}: {
	params: Promise<{ modelId: string[] }>;
	searchParams: Promise<{ tab?: string; provider?: string }>;
}) {
	const { modelId: modelIdParts } = await params;
	const query = await searchParams;
	const modelId = modelIdParts.join("/");
	const initialTab =
		typeof query.tab === "string" && query.tab.trim()
			? query.tab.trim()
			: undefined;
	const focusProviderId =
		typeof query.provider === "string" && query.provider.trim()
			? query.provider.trim()
			: undefined;
	const { row } = await fetchAdminCatalogRecord("model", modelId);
	if (!row) return notFound();
	const deleteAction = deleteModelAction.bind(null, modelId);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Edit model</h1>
				<p className="font-mono text-xs text-muted-foreground">{row.model_id}</p>
			</div>
			<ModelLegacyEditor
				modelId={modelId}
				initialTab={initialTab}
				focusProviderId={focusProviderId}
			/>
			<ModelRevalidationControls modelId={modelId} />
			<div className="flex">
				<Link href="/internal/data/models" className="rounded-md border px-3 py-2 text-sm">
					Back to models
				</Link>
			</div>
			<form action={deleteAction} className="rounded-lg border border-red-300 p-4">
				<div className="mb-2 text-sm font-medium text-red-700">Danger zone</div>
				<button type="submit" className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">
					Delete model
				</button>
			</form>
		</div>
	);
}
