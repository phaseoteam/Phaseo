import { phaseoMarkPath } from "@phaseo/app-kit/logos";
import { cn } from "../lib/utils";

/** The Phaseo "P" on a rounded tile. Development builds use the orange tile. */
export function BrandMark({ className }: { className?: string }) {
	return <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-[5px]", import.meta.env.DEV ? "bg-[#ff8800] text-white" : "bg-foreground text-background", className)}>
		<svg viewBox="8 6 48 52" className="size-[70%]" fill="currentColor"><path d={phaseoMarkPath} /></svg>
	</span>;
}
