import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fetchAdminCatalogRecord } from "@/lib/fetchers/internal/fetchAdminCatalog";
import {
	deleteOrganisationAction,
	updateOrganisationAction,
} from "../../../actions";
import OrganisationLinksFieldset from "../../OrganisationLinksFieldset";

export default async function EditOrganisationPage({
	params,
}: {
	params: Promise<{ organisationId: string }>;
}) {
	const t = await getTranslations("Product.internalTools.dataEditor");
	const { organisationId } = await params;
	const { row, links = [] } = await fetchAdminCatalogRecord("organisation", organisationId);
	if (!row) return notFound();

	const updateAction = updateOrganisationAction.bind(null, organisationId);
	const deleteAction = deleteOrganisationAction.bind(null, organisationId);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">{t("organisationEditTitle")}</h1>
				<p className="font-mono text-xs text-muted-foreground">{row.organisation_id}</p>
			</div>
			<form action={updateAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("name")}</div>
						<input name="name" defaultValue={row.name ?? ""} required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("description")}</div>
						<textarea name="description" defaultValue={row.description ?? ""} className="w-full rounded-md border px-3 py-2 text-sm min-h-24" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("countryCode")}</div>
						<input name="country_code" defaultValue={row.country_code ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("colour")}</div>
						<input name="colour" defaultValue={row.colour ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<OrganisationLinksFieldset initialLinks={links as Array<{ platform: string; url: string }>} />
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						{t("actionSave")}
					</button>
					<Link href="/internal/data/organisations" className="rounded-md border px-3 py-2 text-sm">
						{t("actionBack")}
					</Link>
				</div>
			</form>
			<form action={deleteAction} className="rounded-lg border border-red-300 p-4">
				<div className="mb-2 text-sm font-medium text-red-700">{t("dangerZone")}</div>
				<button type="submit" className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">
					{t("deleteOrganisation")}
				</button>
			</form>
		</div>
	);
}
