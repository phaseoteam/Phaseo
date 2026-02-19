import Link from "next/link";
import { createOrganisationAction } from "../../actions";
import OrganisationLinksFieldset from "../OrganisationLinksFieldset";

export default function NewOrganisationPage() {
	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Create organisation</h1>
			</div>
			<form action={createOrganisationAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Organisation ID</div>
						<input name="organisation_id" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Name</div>
						<input name="name" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Description</div>
						<textarea name="description" className="w-full rounded-md border px-3 py-2 text-sm min-h-24" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Country code</div>
						<input name="country_code" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Colour</div>
						<input name="colour" placeholder="#0EA5E9" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<OrganisationLinksFieldset />
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						Create
					</button>
					<Link href="/internal/data/organisations" className="rounded-md border px-3 py-2 text-sm">
						Cancel
					</Link>
				</div>
			</form>
		</div>
	);
}

