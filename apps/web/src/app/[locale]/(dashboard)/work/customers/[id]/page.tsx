import { notFound } from "next/navigation";
import { CustomerDetail } from "@/components/work/CustomersView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { Customer, CustomerRequest, WorkItem, WorkMember } from "@/lib/work/types";

type CustomerResponse = { customer: Customer; requests: CustomerRequest[]; items: WorkItem[] };

export default async function WorkCustomerPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const context = await requireWorkPage();
	const [result, members] = await Promise.all([
		loadWork<CustomerResponse>(context, `customers/${id}`),
		loadWork<{ members: WorkMember[] }>(context, "members"),
	]);
	if (!result.ok) {
		if (result.status === 404) notFound();
		return <WorkLoadError status={result.status} message={result.message} />;
	}
	return (
		<CustomerDetail
			customer={result.data.customer}
			requests={result.data.requests ?? []}
			items={result.data.items ?? []}
			members={members.ok ? listFrom<WorkMember>(members.data, "members") : []}
		/>
	);
}
