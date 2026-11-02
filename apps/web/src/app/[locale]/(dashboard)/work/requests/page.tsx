import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequestsView } from "@/components/work/RequestsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import { CUSTOMER_REQUEST_STATUSES, type Customer, type CustomerRequest, type CustomerRequestStatus } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.requests");
	return { title: t("title") };
}

export default async function WorkRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
	const context = await requireWorkPage();
	const requested = (await searchParams).status;
	const status: CustomerRequestStatus = (CUSTOMER_REQUEST_STATUSES as readonly string[]).includes(requested ?? "") ? (requested as CustomerRequestStatus) : "new";
	const [requests, customers] = await Promise.all([
		loadWork<{ requests: CustomerRequest[] }>(context, "requests", { status, limit: 100 }),
		loadWork<{ customers: Customer[] }>(context, "customers", { limit: 50 }),
	]);
	if (!requests.ok) return <WorkLoadError status={requests.status} message={requests.message} />;
	return (
		<RequestsView
			status={status}
			requests={listFrom<CustomerRequest>(requests.data, "requests").filter((request) => request.status === status)}
			customers={customers.ok ? listFrom<Customer>(customers.data, "customers") : []}
		/>
	);
}
