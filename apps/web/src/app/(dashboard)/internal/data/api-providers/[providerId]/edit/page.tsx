import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import {
	deleteAPIProviderAction,
	updateAPIProviderAction,
} from "../../../actions";

export default async function EditAPIProviderPage({
	params,
}: {
	params: Promise<{ providerId: string }>;
}) {
	const { providerId } = await params;
	const supabase = await createClient();
	const { data: row } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name, description, link, country_code")
		.eq("api_provider_id", providerId)
		.maybeSingle();
	if (!row) return notFound();

	const updateAction = updateAPIProviderAction.bind(null, providerId);
	const deleteAction = deleteAPIProviderAction.bind(null, providerId);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Edit API provider</h1>
				<p className="font-mono text-xs text-muted-foreground">{row.api_provider_id}</p>
			</div>
			<form action={updateAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Provider name</div>
						<input name="api_provider_name" defaultValue={row.api_provider_name ?? ""} required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Description</div>
						<textarea name="description" defaultValue={row.description ?? ""} className="w-full rounded-md border px-3 py-2 text-sm min-h-24" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Website link</div>
						<input name="link" type="url" defaultValue={row.link ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Country code</div>
						<input name="country_code" defaultValue={row.country_code ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						Save
					</button>
					<Link href="/internal/data/api-providers" className="rounded-md border px-3 py-2 text-sm">
						Back
					</Link>
				</div>
			</form>
			<form action={deleteAction} className="rounded-lg border border-red-300 p-4">
				<div className="mb-2 text-sm font-medium text-red-700">Danger zone</div>
				<button type="submit" className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">
					Delete provider
				</button>
			</form>
		</div>
	);
}

