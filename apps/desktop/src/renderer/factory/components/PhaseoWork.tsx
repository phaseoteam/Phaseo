import { ArrowUpRight } from "lucide-react";
import type { WorkItem } from "../../../shared/factory/types";
import { Tip } from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import { openExternal } from "../lib/useFactory";

/** Marks an item that comes from Phaseo Work, with its number there. */
export function PhaseoBadge({ item, className }: { item: WorkItem; className?: string }) {
	if (!item.phaseo) return null;
	return <Tip label={`Phaseo Work item ${item.phaseo.number}`}>
		<span className={cn("shrink-0 rounded-md border px-1 text-2xs leading-4 font-medium text-muted-foreground", className)}>Work {item.phaseo.number}</span>
	</Tip>;
}

/** Opens the item on phaseo.app. */
export function OpenInPhaseo({ item, className }: { item: WorkItem; className?: string }) {
	if (!item.phaseo) return null;
	const url = item.phaseo.url;
	return <button type="button" onClick={() => openExternal(url)} className={cn("flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm hover:bg-accent/60 hover:text-foreground", className)}>Open in Phaseo<ArrowUpRight className="size-3.5" /></button>;
}
