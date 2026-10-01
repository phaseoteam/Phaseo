import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fetchAdminCatalogRecord } from "@/lib/fetchers/internal/fetchAdminCatalog";
import {
	deleteAPIProviderAction,
	updateAPIProviderAction,
} from "../../../actions";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_VALUES,
} from "@/lib/providers/promptTrainingPolicy";

export default async function EditAPIProviderPage({
	params,
}: {
	params: Promise<{ providerId: string }>;
}) {
	const t = await getTranslations("Product.internalTools.dataEditor");
	const { providerId } = await params;
	const { row } = await fetchAdminCatalogRecord("provider", providerId);
	if (!row) return notFound();

	const updateAction = updateAPIProviderAction.bind(null, providerId);
	const deleteAction = deleteAPIProviderAction.bind(null, providerId);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">{t("providerEditTitle")}</h1>
				<p className="font-mono text-xs text-muted-foreground">{row.api_provider_id}</p>
			</div>
			<form action={updateAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("providerName")}</div>
						<input name="api_provider_name" defaultValue={row.api_provider_name ?? ""} required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("description")}</div>
						<textarea name="description" defaultValue={row.description ?? ""} className="w-full rounded-md border px-3 py-2 text-sm min-h-24" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("websiteLink")}</div>
						<input name="link" type="url" defaultValue={row.link ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("countryCode")}</div>
						<input name="country_code" defaultValue={row.country_code ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("dataCenters")}</div>
						<input name="default_execution_regions" defaultValue={row.default_execution_regions?.join(", ") ?? ""} placeholder="US, EU, APAC" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="flex items-center gap-2 self-end pb-2 text-sm">
						<input name="byok_available" type="checkbox" defaultChecked={row.byok_available === true} className="size-4 rounded border" />
						<span>{t("byokAvailable")}</span>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("promptTrainingPolicy")}</div>
						<select
							name="prompt_training_policy"
							defaultValue={row.prompt_training_policy ?? "unknown"}
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							{PROVIDER_PROMPT_TRAINING_POLICY_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`policy${value.replace(/(^|_)([a-z])/g, (_, __, letter: string) => letter.toUpperCase())}` as never)}
								</option>
							))}
						</select>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("policySourceUrl")}</div>
						<input
							name="prompt_training_source_url"
							type="url"
							defaultValue={row.prompt_training_source_url ?? ""}
							className="w-full rounded-md border px-3 py-2 text-sm"
						/>
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("policyNotes")}</div>
						<textarea
							name="prompt_training_notes"
							defaultValue={row.prompt_training_notes ?? ""}
							className="w-full rounded-md border px-3 py-2 text-sm min-h-20"
						/>
					</label>
				</div>
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						{t("actionSave")}
					</button>
					<Link href="/internal/data/api-providers" className="rounded-md border px-3 py-2 text-sm">
						{t("actionBack")}
					</Link>
				</div>
			</form>
			<form action={deleteAction} className="rounded-lg border border-red-300 p-4">
				<div className="mb-2 text-sm font-medium text-red-700">{t("dangerZone")}</div>
				<button type="submit" className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">
					{t("deleteProvider")}
				</button>
			</form>
		</div>
	);
}
