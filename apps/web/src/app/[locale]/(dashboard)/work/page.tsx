import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkInbox } from "@/components/work/WorkInbox";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { belongsToTab, inboxTabQueries, mergeItems, parseInboxTab } from "@/lib/work/inbox";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkItemsResponse, WorkMember } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.inbox");
	return { title: t("title") };
}

export default async function WorkInboxPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
	const context = await requireWorkPage();
	const tab = parseInboxTab((await searchParams).tab);
	const queries = inboxTabQueries(tab, context.userId);
	const [pages, members] = await Promise.all([
		Promise.all(queries.map((query) => loadWork<WorkItemsResponse>(context, "items", { ...query, limit: 100 }))),
		loadWork<{ members: WorkMember[] }>(context, "members"),
	]);
	const failed = pages.find((page) => !page.ok);
	if (failed && !failed.ok) return <WorkLoadError status={failed.status} message={failed.message} />;
	const loaded = pages.flatMap((page) => (page.ok ? [page.data] : []));
	const items = mergeItems(loaded.map((page) => page.items ?? [])).filter((item) => belongsToTab(tab, item, context.userId));
	const cursor = queries.length === 1 ? loaded[0]?.nextCursor : null;
	return (
		<WorkInbox
			tab={tab}
			items={items}
			members={members.ok ? listFrom<WorkMember>(members.data, "members") : []}
			userId={context.userId}
			more={cursor ? { query: queries[0], cursor } : null}
		/>
	);
}
