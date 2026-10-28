import { Check, ChevronsUpDown, FolderGit2, Plus } from "lucide-react";
import type { FactorySnapshot } from "../../shared/types";
import { href } from "../lib/useFactory";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";

/** owner/name, shown as name: the owner is usually the same for every repository someone works on. */
export function repoName(repo: string): string {
	return repo.split("/")[1] ?? repo;
}

/** Picks one of the repositories Factory works on, or all of them when `all` is set. */
export function RepoPicker({ snapshot, value, onChange, all, className }: { snapshot: FactorySnapshot; value: string; onChange: (repo: string) => void; all?: boolean; className?: string }) {
	const repos = snapshot.repos;
	const open = (repo: string) => snapshot.items.filter((item) => (!repo || item.repo === repo) && (item.state === "open" || item.state === "draft")).length;
	const label = value || (all ? "All repositories" : "Choose a repository");
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" className={cn("no-drag flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent/60", className)}>
			<FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
			<span className="truncate font-medium">{repos.length ? label : "Add a repository"}</span>
			<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
		</button>} />
		<DropdownMenuContent align="start" className="w-72">
			{/* A menu label has to sit in a group, or Base UI throws and the window goes blank. */}
			{repos.length > 0 && <DropdownMenuGroup>
				<DropdownMenuLabel>Repositories</DropdownMenuLabel>
				{all && repos.length > 1 && <DropdownMenuItem onClick={() => onChange("")}>
					<span className="flex-1">All repositories</span>
					<span className="text-2xs text-muted-foreground tabular-nums">{open("")}</span>
					{value === "" ? <Check className="size-3.5" /> : <span className="size-3.5" />}
				</DropdownMenuItem>}
				{repos.map((status) => <DropdownMenuItem key={status.repo} onClick={() => onChange(status.repo)}>
					<span className="min-w-0 flex-1 truncate">{status.repo}</span>
					<span className="text-2xs text-muted-foreground tabular-nums">{status.importing ? "Importing…" : open(status.repo)}</span>
					{value === status.repo ? <Check className="size-3.5" /> : <span className="size-3.5" />}
				</DropdownMenuItem>)}
			</DropdownMenuGroup>}
			{repos.length > 0 && <DropdownMenuSeparator />}
			<DropdownMenuItem onClick={() => (window.location.hash = href({ page: "settings", tab: "repositories" }))}>
				<Plus className="size-3.5" />
				<span>Add a repository</span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}
