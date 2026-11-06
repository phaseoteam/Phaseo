import { useId, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { animationsKey, defaultPanelAnimationDuration, maxPanelAnimationDuration, usePanelAnimationDuration } from "../lib/animations";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";

/** A miniature workspace using the same duration and sidebar transition as the real shell. */
function PanelAnimationPreview() {
	const [open, setOpen] = useState(true);
	return <button type="button" aria-label="Preview panel animation" aria-pressed={open} title="Click to open and close the panels"
		onClick={() => setOpen(value => !value)} className="flex h-12 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-background p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
		<span aria-hidden="true" className="sidebar-frame h-full w-5 shrink-0 rounded-md bg-sidebar-accent" style={{ "--sidebar-width": "20px", "--sidebar-open": open ? 1 : 0 } as CSSProperties} />
		<span aria-hidden="true" className="flex min-w-0 flex-1 flex-col px-1.5">
			<span className="flex min-h-0 flex-1 flex-col gap-1 pt-1"><span className="h-0.5 w-full bg-muted-foreground/30" /><span className="h-0.5 w-4/5 bg-muted-foreground/25" /><span className="h-0.5 w-3/5 bg-muted-foreground/20" /></span>
			<span className={cn("shrink-0 overflow-hidden bg-muted motion-reduce:transition-none transition-[height] duration-(--panel-animation-duration)", open ? "h-2" : "h-0")} />
		</span>
		<span aria-hidden="true" className={cn("h-full shrink-0 rounded-md bg-muted motion-reduce:transition-none transition-[width] duration-(--panel-animation-duration) ease-out", open ? "w-5" : "w-0")} />
	</button>;
}

export function AnimationSettings() {
	const [animations, setAnimations] = usePersistedState<boolean>(animationsKey, true);
	const [duration, setDuration] = usePanelAnimationDuration();
	const inputId = useId();
	return <section aria-label="Animation settings" className="flex flex-col">
		<div className="flex items-center justify-between gap-4 pb-3">
			<div><h2 className="text-[13.5px] font-bold">Animations</h2><p className="mt-0.5 text-xs text-muted-foreground">Spinners keep moving when animations are off.</p></div>
			<Switch aria-label="Animations" checked={animations !== false} onCheckedChange={setAnimations} />
		</div>
		<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border py-3.5">
			<div className="min-w-40 flex-1"><label htmlFor={inputId} className="text-[13px] font-semibold">Panel animation duration</label><p className="mt-0.5 text-xs text-muted-foreground">Click the preview to open and close the panels.</p></div>
			<div className="flex w-full items-center gap-3 min-[1180px]:w-auto">
				<PanelAnimationPreview />
				<output htmlFor={inputId} className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{duration} ms</output>
				<input id={inputId} type="range" aria-label="Panel animation duration" aria-valuetext={duration === 0 ? "Instant" : `${duration} milliseconds`} min={0} max={maxPanelAnimationDuration} step={25} value={duration} disabled={animations === false}
					onChange={event => setDuration(Number(event.currentTarget.value))} className="h-5 min-w-16 flex-1 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-40 min-[1180px]:w-28" />
				<button type="button" aria-label="Reset panel animation duration" title="Reset to 200 ms" disabled={duration === defaultPanelAnimationDuration} onClick={() => setDuration(defaultPanelAnimationDuration)}
					className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"><RotateCcw className="size-3.5" /></button>
			</div>
		</div>
	</section>;
}
