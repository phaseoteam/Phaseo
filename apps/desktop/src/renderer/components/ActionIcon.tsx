import { Copy, Download, ExternalLink, Paperclip, Plus, RefreshCw, Search, Settings, SquareTerminal, type LucideProps } from "lucide-react";
import { cn } from "../lib/utils";

const icons = { copy: Copy, download: Download, external: ExternalLink, paperclip: Paperclip, plus: Plus, refresh: RefreshCw, search: Search, settings: Settings, terminal: SquareTerminal };
export type ActionIconName = keyof typeof icons;

// Normalised lengths let a stroke trace independently of the icon's rendered size.
function normaliseStrokes(svg: SVGSVGElement | null) {
	svg?.querySelectorAll("path, circle, rect").forEach(part => part.setAttribute("pathLength", "1"));
}

/** Opt-in gestures for familiar actions; labels, status glyphs and window controls stay still. */
export function ActionIcon({ name, className, ...props }: { name: ActionIconName } & LucideProps) {
	const Icon = icons[name];
	return <Icon {...props} ref={normaliseStrokes} aria-hidden="true" data-icon-gesture={name} className={cn("gesture-icon", className)} />;
}
