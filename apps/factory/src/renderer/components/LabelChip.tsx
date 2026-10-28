import { cn } from "../lib/utils";

/** A GitHub label in its own colour, toned down so it reads in both themes. */
export function LabelChip({ name, color, className }: { name: string; color?: string; className?: string }) {
	const hex = color && /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : undefined;
	return <span
		className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-[4px] border px-1.5 py-px text-2xs font-medium text-foreground/85", className)}
		style={hex ? { borderColor: `${hex}88`, backgroundColor: `${hex}22` } : undefined}
	>
		{hex && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-[2px]" style={{ backgroundColor: hex }} />}
		<span className="truncate">{name}</span>
	</span>;
}
