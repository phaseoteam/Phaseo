import type { ReactNode } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { ArrowUpRight, Link as LinkIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { errorMessage } from "./presentation";

const popupClass = "z-50 min-w-40 origin-(--transform-origin) rounded-md bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none duration-100 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";
const itemClass = "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-3.5 [&_svg]:shrink-0";

/** Copies a pull request link, with the result said by the caller (a notice line, or nothing). */
export async function copyPullRequestText(text: string, what: string, onNotice?: (message: string, failed?: boolean) => void) {
	try { await navigator.clipboard.writeText(text); onNotice?.(`${what} copied`); }
	catch { onNotice?.(`Could not copy the ${what.toLowerCase()}`, true); }
}

/**
 * T3's right-click on a pull request number (pullRequestLinkContextMenu): Copy link, then Open on GitHub. Everywhere
 * else the number reads as a link, so without this the platform's edit menu would open over text with nothing to edit.
 */
export function PullRequestNumberMenu({ url, children, className, onNotice, onCopy }: { url: string; children: ReactNode; className?: string; onNotice?: (message: string, failed?: boolean) => void; /** The caller's own copy, with its own feedback. */ onCopy?: (url: string) => void }) {
	const open = () => { void window.phaseoDesktop?.workspace?.openLink(url).catch(reason => onNotice?.(`Could not open the link: ${errorMessage(reason)}`, true)); };
	return <ContextMenu.Root>
		<ContextMenu.Trigger render={<span className={cn("inline-flex", className)} data-pull-request-number={url} />} onContextMenu={event => event.stopPropagation()}>{children}</ContextMenu.Trigger>
		<ContextMenu.Portal>
			<ContextMenu.Positioner className="isolate z-50 outline-none">
				<ContextMenu.Popup className={popupClass} aria-label="Pull request link">
					<ContextMenu.Item className={itemClass} onClick={() => { if (onCopy) onCopy(url); else void copyPullRequestText(url, "Link", onNotice); }}><LinkIcon />Copy link</ContextMenu.Item>
					<ContextMenu.Item className={itemClass} onClick={open}><ArrowUpRight />Open on GitHub</ContextMenu.Item>
				</ContextMenu.Popup>
			</ContextMenu.Positioner>
		</ContextMenu.Portal>
	</ContextMenu.Root>;
}
