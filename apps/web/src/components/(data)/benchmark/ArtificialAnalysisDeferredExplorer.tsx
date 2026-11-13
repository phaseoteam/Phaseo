import dynamic from "@/lib/dynamic";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ExplorerPoint } from "@/lib/benchmarks/artificialAnalysisExplorer";

const Explorer = dynamic(() => import("./ArtificialAnalysisExplorer"));

export function ArtificialAnalysisDeferredExplorer({ title, points }: { title: string; points: ExplorerPoint[] }) {
	const [opened, setOpened] = useState(false);
	return <Collapsible className="scroll-mt-36 border-t" onOpenChange={(open) => { if (open) setOpened(true); }}>
		<CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-3 py-4 text-left text-sm font-medium hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<span className="flex-1">{title}</span><ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
		</CollapsibleTrigger>
		<CollapsibleContent keepMounted>{opened ? <div className="pb-6"><Explorer points={points} initialView="intelligence" /></div> : null}</CollapsibleContent>
	</Collapsible>;
}
