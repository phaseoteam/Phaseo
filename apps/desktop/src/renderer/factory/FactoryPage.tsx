import { Factory } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { stageLabel } from "../../shared/factory/stages";
import { ItemMark } from "./components/Marks";
import { threadItem, useFactoryNav, useSnapshot } from "./lib/useFactory";
import { NewIssueView } from "./work/NewIssueView";
import { WorkItemView } from "./work/WorkItemView";
import { EmptyWork, WorkList } from "./work/WorkList";

const unavailable = <div className="grid h-full place-items-center px-8 text-sm text-muted-foreground">Factory runs in the desktop app.</div>;

/** The items the list shows: one repository's, or every repository's. */
function shownItems(snapshot: NonNullable<ReturnType<typeof useSnapshot>>) {
	return snapshot.items.filter((item) => !snapshot.settings.showRepo || item.repo === snapshot.settings.showRepo);
}

/** Code ▸ Factory's main area: the open item, the new issue form, or what to do first. */
export function FactoryPage() {
	const snapshot = useSnapshot();
	const { route } = useFactoryNav();
	if (!window.phaseoDesktop?.factory) return unavailable;
	if (!snapshot) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading Factory…</div>;
	const shown = shownItems(snapshot);
	const selected = route.page === "new" ? undefined : snapshot.items.find((item) => item.id === route.item) ?? shown[0];
	return <div className="flex h-full min-h-0 flex-col">
		{snapshot.error && <div role="alert" className="border-b border-destructive/30 px-4 py-2 text-sm text-destructive">{snapshot.error}</div>}
		{snapshot.demo && <div className="border-b border-border px-4 py-1.5 text-xs text-muted-foreground">Demo data: nothing here is on GitHub, and runs are simulated.</div>}
		<div className="flex min-h-0 flex-1">
			{route.page === "new"
				? <NewIssueView snapshot={snapshot} />
				: selected
					? <WorkItemView key={selected.id} item={selected} snapshot={snapshot} route={{ ...route, item: selected.id }} />
					: <EmptyWork snapshot={snapshot} />}
		</div>
	</div>;
}

/** Code ▸ Factory's sidebar: the work list in place of the Code threads. */
export function FactorySidebar() {
	const snapshot = useSnapshot();
	const { route } = useFactoryNav();
	if (!window.phaseoDesktop?.factory) return null;
	if (!snapshot) return <p className="px-4 py-3 text-xs text-muted-foreground">Loading…</p>;
	const shown = shownItems(snapshot);
	const selected = route.page === "new" ? undefined : snapshot.items.find((item) => item.id === route.item)?.id ?? shown[0]?.id;
	return <WorkList snapshot={snapshot} items={shown} selected={selected} />;
}

/**
 * In a Code thread that belongs to a Factory item (its own thread, or a stage's), a chip back to the item in
 * Code ▸ Factory: "Factory · #12", with the stage for a stage's thread.
 */
export function FactoryThreadChip({ taskId }: { taskId: string }) {
	const snapshot = useSnapshot();
	const { openFactory } = useWorkspace();
	const found = threadItem(snapshot, taskId);
	if (!found) return null;
	const { item, run } = found;
	return <button type="button" title={`Open ${item.repo}#${item.number} in Factory`} onClick={() => openFactory({ item: item.id, ...(run ? { tab: "runs" } : {}) })}
		className="flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
		<Factory className="size-3.5" /><span>Factory</span><span className="text-muted-foreground/60">·</span><ItemMark item={item} className="size-3" /><span className="tabular-nums">#{item.number}</span>{run && <span>{stageLabel(run.stage)}</span>}
	</button>;
}
