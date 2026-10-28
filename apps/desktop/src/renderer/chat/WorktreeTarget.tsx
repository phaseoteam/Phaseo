import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, FolderGit2, GitBranch, Laptop, SearchIcon } from "lucide-react";
import type { WorkspaceApi, WorkspaceCommand } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import type { GitRefs } from "../../shared/gitDiff";
import { mentionPlainText } from "../lib/mentions";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { ScrollArea } from "../components/ui/scroll-area";

type CreateTask = Extract<WorkspaceCommand, { type: "create-task" }>;
export type WorktreeTarget = ReturnType<typeof useWorktreeTarget>;

/**
 * T3's Workspace choice in the new-chat composer: Local runs in the project's own checkout; New worktree makes a
 * worktree from a base branch for the chat. Kept per project folder, as T3 keeps its default per project.
 */
export function useWorktreeTarget(api: WorkspaceApi | undefined, projectId: string | undefined, setOverview: (workspace: WorkspaceOverview) => void) {
	const [modes, setModes] = usePersistedState<Record<string, "local" | "worktree">>("phaseo.desktop.draftWorkspace", {});
	const [refs, setRefs] = useState<GitRefs>();
	const [base, setBase] = useState<string>();
	useEffect(() => {
		setRefs(undefined); setBase(undefined);
		if (!api || !projectId) return;
		let active = true;
		void api.gitRefs(projectId).then(value => { if (active) setRefs(value); }, () => { if (active) setRefs({ local: [], remote: [], current: "" }); });
		return () => { active = false; };
	}, [api, projectId]);
	// Folders that are not Git repositories can only run locally.
	const repository = Boolean(refs && (refs.current || refs.local.length));
	const mode = projectId && repository ? modes[projectId] ?? "local" : "local";
	const chosenBase = base ?? (refs?.current || refs?.local[0] || "HEAD");
	return {
		mode, refs, repository, base: chosenBase,
		setMode: (value: "local" | "worktree") => { if (projectId) setModes(current => ({ ...current, [projectId]: value })); },
		setBase,
		/** For startChat: makes the worktree and the chat in it when New worktree is chosen. */
		create: mode === "worktree" && api && projectId ? async (command: CreateTask, text: string) => {
			const result = await api.startWorktreeChat({ projectId, base: chosenBase, text: mentionPlainText(text), create: command });
			setOverview(result.workspace); return result.taskId;
		} : undefined,
	};
}

/** The Local / New worktree choice and, for a worktree, the base branch it starts from. */
export function WorktreeTargetControls({ target, disabled }: { target: WorktreeTarget; disabled?: boolean }) {
	if (!target.repository) return null;
	const worktree = target.mode === "worktree";
	return <>
		<DropdownMenu>
			<DropdownMenuTrigger disabled={disabled} render={<button type="button" aria-label="Workspace" title="Where the chat works" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 [&_svg]:size-4" />}>
				{worktree ? <FolderGit2 /> : <Laptop />}{worktree ? "New worktree" : "Local"}<ChevronDown className="size-3!" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" side="top" className="w-72">
				<DropdownMenuItem onClick={() => target.setMode("local")} className="items-start"><Laptop className="mt-0.5" /><span><span className="block font-semibold">Local</span><span className="text-xs text-muted-foreground">Work in the project's own checkout.</span></span>{!worktree && <Check className="ml-auto" />}</DropdownMenuItem>
				<DropdownMenuItem onClick={() => target.setMode("worktree")} className="items-start"><FolderGit2 className="mt-0.5" /><span><span className="block font-semibold">New worktree</span><span className="text-xs text-muted-foreground">A separate checkout on a new branch, named from your message.</span></span>{worktree && <Check className="ml-auto" />}</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
		{worktree && target.refs && <BaseBranchPicker refs={target.refs} value={target.base} onChange={target.setBase} disabled={disabled} />}
	</>;
}

/** T3's base branch picker: local branches first, then remote ones, filtered as you type. */
function BaseBranchPicker({ refs, value, onChange, disabled }: { refs: GitRefs; value: string; onChange: (value: string) => void; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const options = useMemo(() => {
		const all = [...new Set([...refs.current ? [refs.current] : [], ...refs.local, ...refs.remote.filter(name => !name.endsWith("/HEAD"))])];
		const needle = query.trim().toLowerCase();
		return (needle ? all.filter(name => name.toLowerCase().includes(needle)) : all).slice(0, 200);
	}, [refs, query]);
	useEffect(() => { setActive(0); }, [query, open]);
	const choose = (name: string) => { onChange(name); setOpen(false); setQuery(""); };
	return <Popover open={open} onOpenChange={setOpen}>
		<PopoverTrigger disabled={disabled} render={<button type="button" aria-label="Base branch" title="The branch the worktree starts from" className="flex h-8 max-w-48 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 data-popup-open:bg-muted [&_svg]:size-4" />}>
			<GitBranch /><span className="truncate font-mono text-xs">from {value}</span><ChevronDown className="size-3! shrink-0" />
		</PopoverTrigger>
		<PopoverContent align="start" side="top" sideOffset={8} className="w-72 gap-0 overflow-hidden rounded-md p-0">
			<div className="p-2 pb-1"><div className="flex h-8 items-center gap-2 rounded-md border border-input bg-input/50 px-2.5">
				<SearchIcon className="size-4 shrink-0 opacity-50" />
				<input autoFocus aria-label="Search branches" placeholder="Search branches" value={query} onChange={event => setQuery(event.target.value)}
					onKeyDown={event => {
						if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
						else if (event.key === "Enter" && options[active]) { event.preventDefault(); choose(options[active]); }
					}}
					className="w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground" />
			</div></div>
			<ScrollArea className="max-h-64" viewportClassName="max-h-64 p-1">
				<div role="listbox" aria-label="Branches">
					{options.map((name, index) => <div key={name} role="option" aria-selected={index === active} onMouseMove={() => setActive(index)} onClick={() => choose(name)}
						className={cn("flex h-7 cursor-default items-center gap-2 rounded-md px-2 font-mono text-xs", index === active && "bg-muted")}>
						<Check className={cn("size-3.5 shrink-0", name !== value && "invisible")} /><span className="truncate">{name}</span>
						{refs.remote.includes(name) && <span className="ml-auto shrink-0 font-sans text-[11px] text-muted-foreground">Remote</span>}
					</div>)}
					{!options.length && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No branches match.</p>}
				</div>
			</ScrollArea>
		</PopoverContent>
	</Popover>;
}
