import Link from "@/components/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import { AuditFiltersWrapper } from "@/components/monitor/AuditFiltersWrapper";
import { auditModelsQuery } from "../internalAdmin.functions";

export async function getAuditMetadata() {
	const t = await getTranslations("Product.internalTools");
	return { title: t("dataAuditTitle") };
}

// The admin gate (requireInternalAdmin("/internal")) runs in the route's
// beforeLoad; the server function re-checks it before returning audit data.
export default function ModelsAuditPage() {
	const t = useTranslations("Product.internalTools");
	const tAudit = useTranslations("Product.internalTools.dataAudit");
	const tEditor = useTranslations("Product.internalTools.dataEditor");

	const { data } = useSuspenseQuery(auditModelsQuery());

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
