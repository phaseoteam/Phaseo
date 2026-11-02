import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkInbox } from "@/components/work/WorkInbox";
import { WorkLiveRefresh } from "@/components/work/WorkLiveRefresh";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { belongsToTab, inboxTabQueries, mergeItems, parseInboxTab } from "@/lib/work/inbox";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import { parseLayout, viewItemsQuery } from "@/lib/work/views";
import type { WorkCycle, WorkItemsResponse, WorkMember, WorkProject, WorkView } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.inbox");
	return { title: t("title") };
}

type SearchParams = Promise<{ tab?: string; view?: string; layout?: string }>;

export default async function WorkInboxPage({ searchParams }: { searchParams: SearchParams }) {
	const context = await requireWorkPage();
	const params = await searchParams;
	const [views, members, projects, cycles] = await Promise.all([
		loadWork<{ views: WorkView[] }>(context, "views"),
		loadWork<{ members: WorkMember[] }>(context, "members"),
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
		loadWork<{ cycles: WorkCycle[] }>(context, "cycles"),
	]);
	const viewList = views.ok ? listFrom<WorkView>(views.data, "views") : [];
	const view = params.view ? viewList.find((entry) => entry.id === params.view) ?? null : null;
	const tab = view ? null : parseInboxTab(params.tab);
	const layout = params.layout ? parseLayout(params.layout) : view ? parseLayout(view.layout) : "list";

	const queries = view ? [viewItemsQuery(view.filters)] : inboxTabQueries(tab ?? "triage", context.userId);
	const pages = await Promise.all(queries.map((query) => loadWork<WorkItemsResponse>(context, "items", { ...query, limit: 100 })));
	const failed = pages.find((page) => !page.ok);
	if (failed && !failed.ok) return <WorkLoadError status={failed.status} message={failed.message} />;
	const loaded = pages.flatMap((page) => (page.ok ? [page.data] : []));
	const merged = mergeItems(loaded.map((page) => page.items ?? []));
	const items = tab ? merged.filter((item) => belongsToTab(tab, item, context.userId)) : merged;
	// "Show more" uses the inbox query shape; a view's extra filters only load its first page.
	const firstQuery = queries[0];
	const cursor = queries.length === 1 && !view ? loaded[0]?.nextCursor : null;
	return (
		<>
		{context.workspaceId ? <WorkLiveRefresh workspaceId={context.workspaceId} /> : null}
		<WorkInbox
			tab={tab}
			items={items}
			members={members.ok ? listFrom<WorkMember>(members.data, "members") : []}
			userId={context.userId}
			more={cursor && firstQuery && "state" in firstQuery ? { query: { state: String(firstQuery.state), assignee: firstQuery.assignee as string | undefined }, cursor } : null}
			layout={layout}
			views={viewList}
			view={view}
			projects={projects.ok ? listFrom<WorkProject>(projects.data, "projects") : []}
			cycles={cycles.ok ? listFrom<WorkCycle>(cycles.data, "cycles") : []}
		/>
		</>
	);
}
