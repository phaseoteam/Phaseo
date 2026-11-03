import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";

/** A panel sub-header. */
export const SURFACE_HEADER_CLASS = "flex h-10 min-h-10 shrink-0 items-center border-b border-border/60 bg-background px-2";

const iconButton = "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 aria-pressed:bg-accent aria-pressed:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0";

/** An icon-only toolbar control with its label in a tooltip. Passing `pressed` makes it a toggle. */
export function ToolbarButton({ label, onClick, pressed, disabled, size = "md", className, children }: { label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; size?: "sm" | "md"; className?: string; children: ReactNode }) {
	return <Tooltip>
		<TooltipTrigger delay={300} render={<button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={cn(iconButton, size === "sm" ? "size-6" : "size-7", className)} />}>{children}</TooltipTrigger>
		<TooltipContent>{label}</TooltipContent>
	</Tooltip>;
}

export function RefreshIcon({ refreshing }: { refreshing: boolean }) {
	return <RefreshCw className={cn(refreshing && "animate-spin [animation-duration:900ms]")} />;
}

/** Centred quiet text for empty and unavailable states. */
export function SurfaceMessage({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("flex min-h-0 flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70", className)}>{children}</div>;
}

export function SurfaceNotice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" }) {
	return <div role="status" className={cn("shrink-0 border-b px-3 py-1.5 text-[11px]", tone === "warning" ? "border-warning/20 bg-warning/10 text-foreground" : "border-border/70 bg-muted/40 text-muted-foreground")}>{children}</div>;
}

export function SurfaceError({ message, onRetry }: { message: string; onRetry?: () => void }) {
	return <div role="alert" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-xs leading-relaxed">
		<p className="text-destructive">{message}</p>
		{onRetry && <button type="button" onClick={onRetry} className="rounded-md border border-input px-2.5 py-1 text-xs text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">Try again</button>}
	</div>;
}

export function DiffFileHeaderSkeleton({ width }: { width: "short" | "medium" | "long" }) {
	return <div className="flex h-8 items-center gap-2 px-2 pr-3">
		<div className="flex size-5 shrink-0 items-center justify-center"><Skeleton className="size-2.5 rounded-sm" /></div>
		<Skeleton className="size-5 shrink-0 rounded-sm" />
		<Skeleton className={width === "short" ? "h-3 w-2/5 max-w-52" : width === "medium" ? "h-3 w-1/2 max-w-64" : "h-3 w-3/5 max-w-72"} />
		<div className="ml-auto flex shrink-0 items-center gap-2"><Skeleton className="h-3 w-5" /><Skeleton className="h-3 w-5" /></div>
	</div>;
}

/** The diff loading state: skeleton file headers and code lines. */
export function DiffLoadingState({ label }: { label: string }) {
	const line = (width: string) => <div className="flex items-center gap-3"><Skeleton className="h-2.5 w-5 shrink-0" /><Skeleton className={cn("h-2.5", width)} /></div>;
	return <div className="min-h-0 flex-1 overflow-hidden bg-background" role="status" aria-live="polite" aria-label={label}>
		<DiffFileHeaderSkeleton width="medium" />
		<div className="flex h-6 items-center gap-2 px-2 pr-3"><div className="h-px flex-1 bg-border/40" /><Skeleton className="h-2.5 w-24" /><div className="h-px flex-1 bg-border/40" /></div>
		<div className="space-y-2 px-3 py-2">{line("w-2/3")}{line("w-4/5")}{line("w-3/5")}</div>
		<DiffFileHeaderSkeleton width="short" />
		<DiffFileHeaderSkeleton width="long" />
		<span className="sr-only">{label}</span>
	</div>;
}

/** Widths cycle rather than vary at random, so a skeleton looks the same on every pass. */
const ghostWidths = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-2/5", "w-3/5", "w-1/2", "w-1/3"];

/** Diff file headers standing in for files still loading. */
export function DiffFileHeadersLoading({ label, count = 3 }: { label: string; count?: number }) {
	const widths = ["medium", "short", "long"] as const;
	return <div role="status" aria-label={label}>
		{Array.from({ length: count }, (_, index) => <div key={index} aria-hidden className="border-b border-border/40"><DiffFileHeaderSkeleton width={widths[index % widths.length]} /></div>)}
		<span className="sr-only">{label}</span>
	</div>;
}

/** Rows of a file tree that is still loading: an icon and a name, some indented as if inside a folder. */
export function FileTreeLoading({ label = "Loading files…", rows = 9 }: { label?: string; rows?: number }) {
	return <div role="status" aria-label={label} className="flex flex-col gap-0.5 px-1 py-1">
		{Array.from({ length: rows }, (_, index) => <div key={index} aria-hidden className={cn("flex h-6 items-center gap-1.5 px-2", index % 4 > 1 && "pl-6")}>
			<Skeleton className="size-3.5 shrink-0 rounded-sm bg-muted-foreground/15" /><Skeleton className={cn("h-3 rounded bg-muted-foreground/15", ghostWidths[index % ghostWidths.length])} />
		</div>)}
		<span className="sr-only">{label}</span>
	</div>;
}

/** The app's light or dark appearance, followed live. */
export function useThemeType(): "light" | "dark" {
	const read = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
	const [theme, setTheme] = useState<"light" | "dark">(read);
	useEffect(() => {
		const observer = new MutationObserver(() => setTheme(read()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => observer.disconnect();
	}, []);
	return theme;
}

/** Removes Electron's "Error invoking remote method" prefix from IPC failures. */
export const ipcError = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
