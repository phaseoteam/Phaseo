import { Factory } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { stageLabel } from "../../shared/factory/stages";
import { ItemMark } from "./components/Marks";
import { threadItem, useSnapshot } from "./lib/useFactory";

/**
 * In a Code thread that belongs to a Factory item (its own thread, or a stage's), a chip back to the item in
 * Code ▸ Factory: "Factory · #12", with the stage for a stage's thread. Its own module, so a chat doesn't load the Factory page.
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
