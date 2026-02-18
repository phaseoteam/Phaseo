import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { deleteModelAction } from "../../../actions";
import ModelLegacyEditor from "./ModelLegacyEditor";

export default async function EditModelPage({
	params,
}: {
	params: Promise<{ modelId: string[] }>;
}) {
	const { modelId: modelIdParts } = await params;
	const modelId = modelIdParts.join("/");
	const supabase = await createClient();
	const { data: row } = await supabase
		.from("data_models")
		.select("model_id, name")
		.eq("model_id", modelId)
		.maybeSingle();
	if (!row) return notFound();
	const deleteAction = deleteModelAction.bind(null, modelId);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Edit model</h1>
				<p className="font-mono text-xs text-muted-foreground">{row.model_id}</p>
			</div>
			<ModelLegacyEditor modelId={modelId} />
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
