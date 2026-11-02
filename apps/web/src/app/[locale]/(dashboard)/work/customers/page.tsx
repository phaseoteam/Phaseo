import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomersView } from "@/components/work/CustomersView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { Customer } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.customers");
	return { title: t("title") };
}

export default async function WorkCustomersPage() {
	const context = await requireWorkPage();
	const result = await loadWork<{ customers: Customer[] }>(context, "customers", { limit: 50 });
	if (!result.ok) return <WorkLoadError status={result.status} message={result.message} />;
	return <CustomersView customers={listFrom<Customer>(result.data, "customers")} />;
}
