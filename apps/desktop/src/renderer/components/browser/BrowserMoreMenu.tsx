import { Minus, MoreVertical, Plus, RotateCcw } from "lucide-react";
import type { BrowserColorScheme } from "../../../shared/browser";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type BrowserMenuActions = {
	hardReload: () => void; toggleDevTools: () => void; toggleDeviceToolbar: () => void; setColorScheme: (value: BrowserColorScheme) => void;
	zoomIn: () => void; zoomOut: () => void; resetZoom: () => void; toggleMute: () => void; openDownloads: () => void; clearCookies: () => void; clearCache: () => void;
};
const schemes: { value: BrowserColorScheme; label: string }[] = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }];

/** The three-dot menu at the end of the browser chrome, as in T3 Code. */
export function BrowserMoreMenu({ enabled, actions, zoom, colorScheme, devToolsOpen, deviceToolbar, muted, downloads, zoomShortcuts }: { enabled: boolean; actions: BrowserMenuActions; zoom: number; colorScheme: BrowserColorScheme; devToolsOpen: boolean; deviceToolbar: boolean; muted: boolean; downloads: number; zoomShortcuts: { in: string; out: string; reset: string } }) {
	const disabled = !enabled;
	return <DropdownMenu>
		<Tooltip>
			<TooltipTrigger render={<DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Browser menu" className="text-muted-foreground hover:text-foreground" />} />}><MoreVertical className="size-3.5" /></TooltipTrigger>
			<TooltipContent>More</TooltipContent>
		</Tooltip>
		<DropdownMenuContent align="end" sideOffset={6} className="w-56 text-xs">
			<DropdownMenuItem disabled={disabled} onClick={actions.hardReload}>Hard reload</DropdownMenuItem>
			<DropdownMenuItem disabled={disabled} onClick={actions.toggleDevTools}>{devToolsOpen ? "Close DevTools" : "Open DevTools"}</DropdownMenuItem>
			<DropdownMenuItem onClick={actions.toggleDeviceToolbar}>{deviceToolbar ? "Hide device toolbar" : "Show device toolbar"}</DropdownMenuItem>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger disabled={disabled}>Appearance</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className="w-36">
					<DropdownMenuRadioGroup value={colorScheme} onValueChange={value => actions.setColorScheme(value as BrowserColorScheme)}>
						{schemes.map(scheme => <DropdownMenuRadioItem key={scheme.value} value={scheme.value}>{scheme.label}</DropdownMenuRadioItem>)}
					</DropdownMenuRadioGroup>
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			<DropdownMenuItem disabled={disabled} onClick={actions.toggleMute}>{muted ? "Unmute tab" : "Mute tab"}</DropdownMenuItem>
			<DropdownMenuItem onClick={actions.openDownloads}>Downloads{downloads > 0 && <DropdownMenuShortcut className="tabular-nums">{downloads}</DropdownMenuShortcut>}</DropdownMenuItem>
			<DropdownMenuSeparator />
			{/* The zoom row stays open while its buttons are pressed. */}
			<DropdownMenuItem closeOnClick={false} disabled={disabled} onClick={event => event.preventDefault()} className="justify-between">
				<span>Zoom</span>
				<span className="flex items-center gap-1">
					<Button type="button" variant="outline" size="icon-xs" aria-label="Zoom out" title={zoomShortcuts.out} disabled={disabled} onClick={actions.zoomOut}><Minus /></Button>
					<span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
					<Button type="button" variant="outline" size="icon-xs" aria-label="Zoom in" title={zoomShortcuts.in} disabled={disabled} onClick={actions.zoomIn}><Plus /></Button>
					<Button type="button" variant="ghost" size="icon-xs" aria-label="Reset zoom" title={zoomShortcuts.reset} disabled={disabled} onClick={actions.resetZoom}><RotateCcw /></Button>
				</span>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuLabel>Browsing data for every tab</DropdownMenuLabel>
				<DropdownMenuItem onClick={actions.clearCookies}>Clear cookies</DropdownMenuItem>
				<DropdownMenuItem onClick={actions.clearCache}>Clear cache</DropdownMenuItem>
			</DropdownMenuGroup>
		</DropdownMenuContent>
	</DropdownMenu>;
}
