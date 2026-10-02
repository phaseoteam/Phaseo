import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuditFiltersWrapper } from "@/components/monitor/AuditFiltersWrapper";
import { getAuditModels } from "@/lib/fetchers/models/table-view/getAuditModels";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";

export async function generateMetadata() {
	const t = await getTranslations("Product.internalTools");
	return { title: t("dataAuditTitle") };
}

export default async function ModelsAuditPage() {
	const t = await getTranslations("Product.internalTools");
	const tAudit = await getTranslations("Product.internalTools.dataAudit");
	const tEditor = await getTranslations("Product.internalTools.dataEditor");
	await requireInternalAdmin("/internal");

	const data = await getAuditModels(true);

	return (
		<div className="mx-8 py-8 space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{t("dataAuditTitle")}</h1>
					<p className="text-sm text-muted-foreground">
						{t("dataAuditDescription")}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Link
						href="/internal/audit/providers"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						{tAudit("auditByProvider")}
					</Link>
					<Link
						href="/internal/data"
						className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
					>
						{tAudit("openDataEditor")}
					</Link>
					<Link
						href="/internal/data/models/new"
						className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
					>
						{tEditor("newModel")}
					</Link>
				</div>
			</div>
			<AuditFiltersWrapper data={data} />
		</div>
	);
}
