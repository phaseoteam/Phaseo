import { useState } from "react";
import { Check, Layers, RefreshCw, TriangleAlert } from "lucide-react";
import type { PullRequestMergeMethod, PullRequestView } from "../../../shared/pullRequestView";
import { isStackedBase, stackActionLayers, type PullRequestStack, type PullRequestStackLayer, type PullRequestStackMembership } from "../../../shared/pullRequestStacks";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { toastManager } from "../../components/ui/toast";
import { usePersistedState } from "../../lib/persistedState";
import { cn } from "../../lib/utils";
import { openPullRequest } from "./events";
import { errorMessage, PullRequestGlyph, pullRequestStatePresentation, Tip } from "./presentation";
import { mergeMethodLabels } from "./pullRequestLogic";
import { forgetPullRequestStacks, usePullRequestStack } from "./usePullRequestStack";

/** The stack glyph. */
export const StackGlyph = Layers;

/** A layer: state glyph, title over number, branch and state. */
export function StackLayerContent({ layer, compact = false }: { layer: PullRequestStackLayer; compact?: boolean }) {
	const state = pullRequestStatePresentation(layer.state, layer.draft ?? false);
	return <>
		<state.Icon aria-hidden className={cn("size-4 shrink-0", state.toneClassName)} />
		<span className="min-w-0 flex-1">
			<span className="block truncate">{layer.title || layer.headBranch}</span>
			<span className="block truncate text-xs font-normal text-muted-foreground">#{layer.number} · {compact ? null : `${layer.headBranch} · `}{state.label}</span>
		</span>
	</>;
}
function StackHeader({ number, notice, stale = false }: { number: number; notice?: string | null; stale?: boolean }) {
	return <DropdownMenuLabel className="flex items-center justify-between gap-2"><span>Stack #{number}</span>{notice && <Tip label={notice}><span role="status" className="text-xs font-normal">{stale ? "May be stale" : "Refreshing…"}</span></Tip>}</DropdownMenuLabel>;
}
/** The layers top first, the current one ticked, then the base the stack stands on. */
function StackLayers({ stack, current, onSelect, pending = false }: { stack: PullRequestStack; current: number; onSelect?: (number: number) => void; pending?: boolean }) {
	return <div className="max-h-80 overflow-y-auto">
		{[...stack.layers].reverse().map(layer => <DropdownMenuItem key={layer.number} disabled={!onSelect || pending} aria-current={layer.number === current ? "true" : undefined} onClick={() => onSelect?.(layer.number)}>
			<StackLayerContent layer={layer} />{layer.number === current && <Check aria-hidden className="size-3.5" />}
		</DropdownMenuItem>)}
		<DropdownMenuLabel>↳ {stack.base}</DropdownMenuLabel>
	</div>;
}

/** Mounted only while the menu is open, so list rows do not each read a stack. */
function StackBody({ projectId, number, stackNumber, onSelect }: { projectId: string; number: number; stackNumber: number; onSelect: (number: number) => void }) {
	const query = usePullRequestStack(projectId, number);
	if (query.stack) return <>
		<StackHeader number={query.stack.number} notice={query.notice} stale={!!query.error} />
		{query.error && <DropdownMenuItem onClick={query.refresh}>Retry stack refresh</DropdownMenuItem>}
		<StackLayers stack={query.stack} current={number} onSelect={onSelect} />
	</>;
	return <><StackHeader number={stackNumber} /><DropdownMenuLabel className="font-normal">{query.error ?? (query.pending || !query.loaded ? "Loading stack…" : "This pull request is no longer in a stack.")}</DropdownMenuLabel></>;
}

/** A list row's "n/m" layer marker, opening the stack's layers. */
export function StackPopover({ projectId, number, membership, onSelect = layer => openPullRequest({ number: layer }) }: { projectId: string; number: number; membership: PullRequestStackMembership; onSelect?: (number: number) => void }) {
	const [open, setOpen] = useState(false);
	const label = `Stack ${membership.number}, layer ${membership.position} of ${membership.size}`;
	return <DropdownMenu open={open} onOpenChange={setOpen}>
		<Tip label={`View stack #${membership.number}, layer ${membership.position} of ${membership.size}`}>
			<DropdownMenuTrigger nativeButton={false} render={<span role="button" tabIndex={0} aria-label={label} className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-normal text-muted-foreground" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} />}>
				<StackGlyph aria-hidden className="size-3" />{membership.position}/{membership.size}
			</DropdownMenuTrigger>
		</Tip>
		<DropdownMenuContent align="start" className="w-72" onClick={event => event.stopPropagation()}>
			<DropdownMenuGroup>{open && <StackBody projectId={projectId} number={number} stackNumber={membership.number} onSelect={layer => { setOpen(false); onSelect(layer); }} />}</DropdownMenuGroup>
		</DropdownMenuContent>
	</DropdownMenu>;
}

/** The stacked mark on the detail header's base branch: the base is not the repository's default branch. */
export function StackedBaseGlyph({ projectId, view }: { projectId: string; view: Pick<PullRequestView, "number" | "base"> }) {
	const { defaultBranch } = usePullRequestStack(projectId, view.number);
	if (!isStackedBase(view.base, defaultBranch)) return null;
	return <Tip label={`Stacked on ${view.base}`}><span className="inline-flex shrink-0"><StackGlyph role="img" aria-label="Stacked pull request" className="size-3 shrink-0" /></span></Tip>;
}

/**
 * The detail header's stack control: "n/m" opens the layers, with Merge stack and Rebase
 * stack beneath; a primary Merge stack button sits beside it while this layer is open. Both act only after a confirm
 * dialog that lists the layers they touch.
 */
export function StackMenu({ projectId, view, onSelect = number => openPullRequest({ number }), onActed }: { projectId: string; view: PullRequestView; onSelect?: (number: number) => void; onActed?: () => void }) {
	const api = window.phaseoDesktop?.workspace;
	const query = usePullRequestStack(projectId, view.number);
	const [storedMethod] = usePersistedState<PullRequestMergeMethod>("phaseo.desktop.pullRequestMergeMethod", "squash");
	const [open, setOpen] = useState(false), [confirmation, setConfirmation] = useState<"merge" | "rebase" | null>(null), [pending, setPending] = useState(false);
	const stack = query.stack;
	if (!stack) return !query.pending && query.error ? <Button variant="ghost" size="xs" onClick={query.refresh}>Retry stack lookup</Button> : null;
	const position = stack.layers.findIndex(layer => layer.number === view.number) + 1;
	const fresh = !query.pending && !query.error;
	const method = view.mergeMethods.includes(storedMethod) ? storedMethod : view.mergeMethods[0] ?? "merge";
	const canMerge = fresh && view.viewer.canMerge && view.mergeMethods.length > 0, canRebase = fresh && view.viewer.canUpdate;
	const merge = stackActionLayers(stack, view.number, "merge"), top = stack.layers.at(-1)!, rebase = stackActionLayers(stack, top.number, "rebase");
	const selected = stack.layers[position - 1];
	const run = async () => {
		const action = confirmation, plan = action === "merge" ? merge : rebase;
		if (!api || pending || !action || plan.reason || !plan.target) return;
		setPending(true); setConfirmation(null);
		const id = toastManager.add({ type: "loading", title: action === "merge" ? "Merging stack…" : "Rebasing stack…", timeout: 0 });
		try {
			await api.pullRequestStackAction(projectId, { number: plan.target.number, stackNumber: stack.number, action, ...(action === "merge" ? { method } : {}), expectedHeads: plan.layers.map(layer => ({ number: layer.number, headSha: layer.headSha! })) });
			toastManager.update(id, { type: "success", title: action === "merge" ? "Stack merge request completed" : "Stack rebased", description: action === "merge" ? "GitHub merged the stack or added it to its merge queue." : undefined, timeout: 5000 });
		} catch (reason) {
			toastManager.update(id, { type: "error", title: action === "merge" ? "Could not merge the stack" : "Could not rebase the stack", description: errorMessage(reason), timeout: 8000 });
		} finally {
			setPending(false); forgetPullRequestStacks(projectId, stack.layers.map(layer => layer.number)); query.refresh(); onActed?.();
		}
	};
	const confirmLayers = confirmation === "merge" ? merge.layers : rebase.layers;
	const plural = (count: number) => `${count} ${count === 1 ? "pull request" : "pull requests"}`;
	return <>
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<Tip label={`View stack #${stack.number}, layer ${position} of ${stack.layers.length}${query.notice ? ` · ${query.notice}` : ""}`}>
				<DropdownMenuTrigger render={<Button variant="ghost" size="xs" aria-label={`Stack ${stack.number}, layer ${position} of ${stack.layers.length}`} />}>
					<StackGlyph aria-hidden className="size-3.5" />{position}/{stack.layers.length}{query.error && <TriangleAlert aria-hidden className="size-3 text-amber-600 dark:text-amber-400" />}
				</DropdownMenuTrigger>
			</Tip>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuGroup>
					<StackHeader number={stack.number} notice={query.notice} stale={!!query.error} />
					{query.error && <DropdownMenuItem onClick={query.refresh}>Retry stack refresh</DropdownMenuItem>}
					<StackLayers stack={stack} current={view.number} pending={pending} onSelect={number => { setOpen(false); if (number !== view.number) onSelect(number); }} />
				</DropdownMenuGroup>
				{(canMerge || canRebase) && <>
					<DropdownMenuSeparator />
					{canMerge && <DropdownMenuItem disabled={pending || Boolean(merge.reason)} onClick={() => setConfirmation("merge")}><PullRequestGlyph.merged aria-hidden className="size-3.5" />Merge stack ({merge.layers.length})</DropdownMenuItem>}
					{canRebase && <DropdownMenuItem disabled={pending || Boolean(rebase.reason)} onClick={() => setConfirmation("rebase")}><RefreshCw aria-hidden className="size-3.5" />Rebase stack</DropdownMenuItem>}
					{canMerge && merge.reason === "Every layer being merged must be open and ready for review." && <p className="px-2 py-1 text-xs text-muted-foreground">{merge.reason}</p>}
				</>}
			</DropdownMenuContent>
		</DropdownMenu>
		{canMerge && selected?.state === "open" && <Tip label={`Merge stack through #${view.number} into ${stack.base} (${plural(merge.layers.length)})`}>
			<span className="inline-flex"><Button size="xs" disabled={pending || Boolean(merge.reason)} onClick={() => setConfirmation("merge")}><PullRequestGlyph.merged aria-hidden className="size-3.5" /><span className="@max-[30rem]/pr-header:hidden">Merge stack</span></Button></span>
		</Tip>}
		<Dialog open={confirmation !== null} onOpenChange={value => { if (!value) setConfirmation(null); }}>
			<DialogContent className="max-w-md gap-4 p-5">
				<DialogHeader>
					<DialogTitle>{confirmation === "merge" ? `Merge ${plural(merge.layers.length)}?` : `Rebase ${plural(rebase.layers.length)}?`}</DialogTitle>
					<DialogDescription className="text-xs">{confirmation === "merge"
						? `Merge #${view.number} and its unmerged layers below into ${stack.base} using ${mergeMethodLabels[method].toLowerCase()}. GitHub checks their rules before merging or queueing them and rebases the remaining stack after merging.`
						: `Rebase the remote branches from bottom to top onto ${stack.base}. This rewrites branch history and may restart checks. If a layer fails, earlier updates remain.`}</DialogDescription>
				</DialogHeader>
				<ul className="max-h-48 divide-y divide-border/60 overflow-y-auto border-y border-border/60 text-sm">
					{confirmLayers.map(layer => <li key={layer.number} className="flex items-center gap-2 px-1 py-2"><StackLayerContent layer={layer} compact /></li>)}
				</ul>
				<DialogFooter><Button size="sm" variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button><Button size="sm" onClick={() => void run()}>{confirmation === "merge" ? "Merge stack" : "Rebase stack"}</Button></DialogFooter>
			</DialogContent>
		</Dialog>
	</>;
}
