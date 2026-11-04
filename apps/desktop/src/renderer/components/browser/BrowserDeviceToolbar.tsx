import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, Link2, Unlink2, X } from "lucide-react";
import { useState } from "react";
import { browserDeviceToolbarHeight, browserViewportLimits, browserViewportPresets, validBrowserDimension, type BrowserViewport } from "../../../shared/browser";
import { cn } from "../../lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { BrowserIconButton } from "./BrowserChromeRow";

type Device = Extract<BrowserViewport, { mode: "device" }>;
const responsive = "responsive";

/** Screen-rotation glyph for the device toolbar. */
function ScreenRotationIcon() {
	return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-3.5">
		<rect x="7.25" y="7.25" width="9.5" height="9.5" rx="1.4" transform="rotate(-45 12 12)" /><path d="M12.5 2a10 10 0 0 1 8.4 5.4" /><path d="M20.8 3.5v4h-4" /><path d="M11.5 22a10 10 0 0 1-8.4-5.4" /><path d="M3.2 20.5v-4h4" />
	</svg>;
}

/** Dimensions in the device toolbar's width and height fields, or why they cannot be used. */
export function customViewport(width: string, height: string, preset?: Device["preset"]): Device | undefined {
	const w = Number(width), h = Number(height);
	if (!validBrowserDimension(w) || !validBrowserDimension(h) || w * h > browserViewportLimits.area) return;
	return { mode: "device", width: w, height: h, ...(preset ? { preset } : {}) };
}

/** The device toolbar: preset, width × height, aspect lock, rotate and close. */
export function BrowserDeviceToolbar({ viewport, width, aspectLocked, onAspectLock, onChange }: { viewport: Device; width: number; aspectLocked: boolean; onAspectLock: (locked: boolean) => void; onChange: (viewport: BrowserViewport) => void }) {
	const [draft, setDraft] = useState<{ width: string; height: string }>();
	const shown = draft ?? { width: String(viewport.width), height: String(viewport.height) };
	const custom = customViewport(shown.width, shown.height);
	const apply = () => { setDraft(undefined); if (custom && (custom.width !== viewport.width || custom.height !== viewport.height)) onChange(custom); };
	const edit = (axis: "width" | "height", value: string) => setDraft(current => {
		const next = { ...(current ?? { width: String(viewport.width), height: String(viewport.height) }), [axis]: value };
		const number = Number(value);
		if (aspectLocked && validBrowserDimension(number)) {
			const ratio = viewport.width / viewport.height;
			if (axis === "width") next.height = String(Math.round(number / ratio)); else next.width = String(Math.round(number * ratio));
		}
		return next;
	});
	const selected = viewport.preset ?? responsive;
	const items = [{ value: responsive, label: "Responsive" }, ...browserViewportPresets.map(preset => ({ value: preset.id, label: preset.label }))];
	const choose = (value: string | null) => {
		if (!value || value === selected) return;
		if (value === responsive) { onChange({ mode: "device", width: viewport.width, height: viewport.height }); return; }
		const preset = browserViewportPresets.find(item => item.id === value);
		if (preset) onChange({ mode: "device", width: preset.width, height: preset.height, preset: preset.id });
	};
	// Turning a preset device keeps it that device, now on its side.
	const rotate = () => { setDraft(undefined); const source = custom ?? viewport; onChange({ mode: "device", width: source.height, height: source.width, ...(draft || !viewport.preset ? {} : { preset: viewport.preset }) }); };
	const numberClass = cn("h-6 rounded-md border border-transparent bg-input/50 px-1.5 text-center font-mono text-xs tabular-nums outline-none [appearance:textfield] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive [&::-webkit-inner-spin-button]:appearance-none", width >= 360 ? "w-14" : "w-12");
	return <div role="toolbar" aria-label="Browser device toolbar" data-browser-device-toolbar style={{ height: browserDeviceToolbarHeight }}
		className="flex w-full items-center gap-0.5 overflow-hidden border-b border-border/70 bg-background/95 px-1.5 backdrop-blur-md"
		onBlur={event => { const next = event.relatedTarget; if (next instanceof Node && event.currentTarget.contains(next)) return; if (next instanceof HTMLElement && next.closest("[data-browser-device-options]")) return; apply(); }}>
		{width >= 560 && <span className="mr-0.5 shrink-0 text-xs font-medium text-muted-foreground">Dimensions</span>}
		<SelectPrimitive.Root value={selected} onValueChange={choose} items={items} modal={false}>
			<SelectPrimitive.Trigger aria-label="Browser device preset" value={selected} className={cn("flex h-6 shrink-0 items-center justify-between gap-1 rounded-md px-1.5 text-xs outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-accent", width >= 440 ? "w-36" : "w-24")}>
				<SelectPrimitive.Value className="truncate" />
				<SelectPrimitive.Icon><ChevronDown className="size-3.5 text-muted-foreground" /></SelectPrimitive.Icon>
			</SelectPrimitive.Trigger>
			<SelectPrimitive.Portal>
				<SelectPrimitive.Positioner side="bottom" align="start" sideOffset={4} alignItemWithTrigger={false} className="isolate z-50" data-browser-device-options>
					<SelectPrimitive.Popup aria-label="Browser device preset options" className="max-h-(--available-height) min-w-60 overflow-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none dark:ring-foreground/10">
						<ScrollArea className="max-h-80" viewportClassName="max-h-80">
							<SelectPrimitive.List>
								{[{ id: responsive, label: "Responsive", detail: "" }, ...browserViewportPresets.map(preset => ({ id: preset.id, label: preset.label, detail: `${preset.width} × ${preset.height}` }))].map((item, index) => <div key={item.id}>
									{index === 1 && <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground">Standard</div>}
									<SelectPrimitive.Item value={item.id} data-option-value={item.id} className="relative flex min-h-7 cursor-default items-center gap-5 rounded-md py-1 pr-7 pl-2 text-xs outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
										<SelectPrimitive.ItemText className="flex-1">{item.label}</SelectPrimitive.ItemText>
										{item.detail && <span className="tabular-nums text-muted-foreground">{item.detail}</span>}
										<SelectPrimitive.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center"><Check className="size-3.5" /></SelectPrimitive.ItemIndicator>
									</SelectPrimitive.Item>
								</div>)}
							</SelectPrimitive.List>
						</ScrollArea>
					</SelectPrimitive.Popup>
				</SelectPrimitive.Positioner>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
		<form className="m-0 flex shrink-0 items-center gap-0.5" aria-label="Viewport dimensions" onSubmit={event => { event.preventDefault(); apply(); }}>
			<input type="number" inputMode="numeric" min={browserViewportLimits.min} max={browserViewportLimits.max} value={shown.width} aria-label="Viewport width" aria-invalid={!custom} className={numberClass} onChange={event => edit("width", event.target.value)} />
			<span className="text-xs text-muted-foreground">×</span>
			<input type="number" inputMode="numeric" min={browserViewportLimits.min} max={browserViewportLimits.max} value={shown.height} aria-label="Viewport height" aria-invalid={!custom} className={numberClass} onChange={event => edit("height", event.target.value)} />
			<button type="submit" hidden />
		</form>
		<BrowserIconButton label={aspectLocked ? "Unlock viewport aspect ratio" : "Lock viewport aspect ratio"} tooltip={aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"} aria-pressed={aspectLocked} variant={aspectLocked ? "secondary" : "ghost"} icon={aspectLocked ? <Link2 /> : <Unlink2 />} disabled={!custom} onPointerDown={event => event.preventDefault()} onClick={() => onAspectLock(!aspectLocked)} />
		<BrowserIconButton label="Rotate viewport" icon={<ScreenRotationIcon />} onClick={rotate} />
		<span className="ml-auto flex">
			<BrowserIconButton label="Close device toolbar" icon={<X />} onClick={() => onChange({ mode: "fill" })} />
		</span>
	</div>;
}
