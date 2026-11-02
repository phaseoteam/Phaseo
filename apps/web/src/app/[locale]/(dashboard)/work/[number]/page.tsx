import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkItemView } from "@/components/work/WorkItemView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkItemDetailResponse, WorkMember } from "@/lib/work/types";

type Params = Promise<{ number: string }>;

function parseNumber(value: string): number | null {
	return /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
	const number = parseNumber((await params).number);
	return { title: number ? `#${number}` : undefined };
}

export default async function WorkItemPage({ params }: { params: Params }) {
	const number = parseNumber((await params).number);
	if (!number) notFound();
	const context = await requireWorkPage();
	const [detail, members] = await Promise.all([
		loadWork<WorkItemDetailResponse>(context, `items/${number}`),
		loadWork<{ members: WorkMember[] }>(context, "members"),
	]);
	if (!detail.ok) {
		if (detail.status === 404) notFound();
		return <WorkLoadError status={detail.status} message={detail.message} />;
	}
	const { item, events, requests, runs, errorGroup } = detail.data;
	return (
		<WorkItemView
			item={item}
			events={events ?? []}
			requests={requests ?? []}
			runs={runs ?? []}
			errorGroup={errorGroup ?? null}
			members={members.ok ? listFrom<WorkMember>(members.data, "members") : []}
		/>
	);
}
