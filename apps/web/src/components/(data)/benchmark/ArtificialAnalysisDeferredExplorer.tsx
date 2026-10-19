"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ExplorerPoint } from "@/lib/benchmarks/artificialAnalysisExplorer";

const Explorer = dynamic(() => import("./ArtificialAnalysisExplorer"));

export function ArtificialAnalysisDeferredExplorer({ title, points }: { title: string; points: ExplorerPoint[] }) {
	const [opened, setOpened] = useState(false);
	return <details className="group scroll-mt-36 border-t" onToggle={(event) => { if (event.currentTarget.open) setOpened(true); }}>
		<summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-sm font-medium hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
			<span className="flex-1">{title}</span><ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
		</summary>
		{opened ? <div className="pb-6"><Explorer points={points} initialView="intelligence" /></div> : null}
	</details>;
}
