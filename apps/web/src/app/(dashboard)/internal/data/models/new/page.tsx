import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createModelAction } from "../../actions";

export default async function NewModelPage() {
	const supabase = await createClient();
	const { data: organisations } = await supabase
		.from("data_organisations")
		.select("organisation_id, name")
		.order("name", { ascending: true });

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Create model</h1>
			</div>
			<form action={createModelAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Model ID</div>
						<input name="model_id" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Name</div>
						<input name="name" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Organisation</div>
						<select name="organisation_id" className="w-full rounded-md border px-3 py-2 text-sm">
							<option value="">None</option>
							{(organisations ?? []).map((org: any) => (
								<option key={org.organisation_id} value={org.organisation_id}>
									{org.name ?? org.organisation_id}
								</option>
							))}
						</select>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Status</div>
						<input name="status" defaultValue="active" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm flex items-center gap-2 self-end">
						<input type="checkbox" name="hidden" />
						<span>Hidden</span>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Release date</div>
						<input type="date" name="release_date" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Announcement date</div>
						<input type="date" name="announcement_date" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Deprecation date</div>
						<input type="date" name="deprecation_date" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Retirement date</div>
						<input type="date" name="retirement_date" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Input types</div>
						<input name="input_types" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Output types</div>
						<input name="output_types" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground sm:w-auto">
						Create
					</button>
					<Link href="/internal/data/models" className="w-full rounded-md border px-3 py-2 text-center text-sm sm:w-auto">
						Cancel
					</Link>
				</div>
			</form>
		</div>
	);
}
