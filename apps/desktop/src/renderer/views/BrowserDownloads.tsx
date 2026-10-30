import { X } from "lucide-react";
import type { BrowserDownload, BrowserDownloadCommand } from "../../shared/browserDownloads";
import { BrowserIconButton } from "../components/browser/BrowserChromeRow";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";

const bytes = (value: number) => value < 1024 ? value + " B" : value < 1048576 ? (value / 1024).toFixed(1) + " KB" : (value / 1048576).toFixed(1) + " MB";
const statusLabel = { progressing: "Downloading", paused: "Paused", completed: "Completed", cancelled: "Cancelled", interrupted: "Interrupted" } as const;

/** This chat's downloads in flat rows, over the page. */
export function BrowserDownloads({ downloads, action, onClose }: { downloads: BrowserDownload[]; action: (command: BrowserDownloadCommand) => void; onClose: () => void }) {
	return <section className="browser-downloads flex h-full min-h-0 flex-col" aria-label="Downloads">
		<div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-3">
			<h2 className="flex-1 text-xs font-medium">Downloads</h2>
			<BrowserIconButton label="Close downloads" icon={<X />} onClick={onClose} />
		</div>
		<ScrollArea className="min-h-0 flex-1">
			{!downloads.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No downloads in this chat.</p>}
			<div className="flex flex-col divide-y divide-border/60">
				{downloads.map(item => <article key={item.id} className="flex flex-col gap-1.5 px-3 py-2.5">
					<strong className="truncate text-xs font-medium" title={item.filename}>{item.filename}</strong>
					<span className="text-xs text-muted-foreground tabular-nums">{statusLabel[item.status]} · {bytes(item.received)}{item.total > 0 ? " / " + bytes(item.total) : ""}</span>
					{item.error && <p role="alert" className="text-xs text-destructive">{item.error}</p>}
					{!item.finished && <div role="progressbar" aria-label={"Download progress: " + item.filename} aria-valuenow={item.total > 0 ? Math.round(item.received / item.total * 100) : undefined} className="h-1 overflow-hidden rounded-full bg-muted">
						<div className={item.total > 0 ? "h-full bg-primary transition-[width]" : "h-full w-1/3 animate-pulse bg-primary"} style={item.total > 0 ? { width: `${Math.min(100, item.received / item.total * 100)}%` } : undefined} />
					</div>}
					<div className="flex flex-wrap gap-1">
						{!item.finished && <>
							{item.status === "progressing" && <Button type="button" variant="ghost" size="xs" onClick={() => action({ type: "pause", id: item.id })}>Pause</Button>}
							{(item.status === "paused" || item.resumable) && <Button type="button" variant="ghost" size="xs" onClick={() => action({ type: "resume", id: item.id })}>Resume</Button>}
							<Button type="button" variant="ghost" size="xs" onClick={() => action({ type: "cancel", id: item.id })}>Cancel</Button>
						</>}
						{item.status === "completed" && <Button type="button" variant="ghost" size="xs" onClick={() => action({ type: "reveal", id: item.id })}>Show in folder</Button>}
						{item.finished && <Button type="button" variant="ghost" size="xs" onClick={() => action({ type: "dismiss", id: item.id })}>Remove</Button>}
					</div>
				</article>)}
			</div>
		</ScrollArea>
	</section>;
}
