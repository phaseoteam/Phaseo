import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Native, keyboard-accessible disclosure row used to keep secondary benchmark detail out of the main view. */
export function BenchmarkDisclosure({ id, title, count, children }: { id?: string; title: ReactNode; count?: ReactNode; children: ReactNode }) {
	return <details id={id} className="group scroll-mt-36 border-t">
		<summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-sm font-medium hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
			<span className="flex-1">{title}</span>
			{count !== undefined ? <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span> : null}
			<ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
		</summary>
		<div className="pb-6">{children}</div>
	</details>;
}
