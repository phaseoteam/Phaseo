import { FolderGit2, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import type { LocalClone } from "../../shared/types";
import { factory } from "../lib/useFactory";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export const errorText = (cause: unknown) => (cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(cause));

const sameRepo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Clones of GitHub repositories on this computer, looked up once per mount. */
export function useLocalClones(): LocalClone[] | null {
	const [clones, setClones] = useState<LocalClone[] | null>(null);
	useEffect(() => {
		let live = true;
		void factory().localClones().then((found) => live && setClones(found), () => live && setClones([]));
		return () => {
			live = false;
		};
	}, []);
	return clones;
}

/** How many found clones show before "Show all". */
const FOUND_SHOWN = 5;

/**
 * Adds a repository: choose a local clone and Factory reads which one it is, or type owner/name and
 * Factory fills in a clone it found. Clones found on this computer can be added with one click.
 * Adding one reads every open issue and pull request.
 */
export function AddRepo({ added = [], className }: { added?: string[]; className?: string }) {
	const [repo, setRepo] = useState("");
	const [checkout, setCheckout] = useState("");
	// A folder chosen by hand stays put; one Factory found follows what's typed.
	const [chosen, setChosen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showAll, setShowAll] = useState(false);
	const clones = useLocalClones();

	const matches = clones?.filter((clone) => sameRepo(clone.repo, repo)) ?? [];
	// Most recently used first, one clone per repository.
	const found = (clones ?? []).filter((clone, index, all) => !added.some((entry) => sameRepo(entry, clone.repo)) && all.findIndex((other) => sameRepo(other.repo, clone.repo)) === index);
	const folder = chosen ? checkout : matches.some((clone) => clone.path === checkout) ? checkout : matches[0]?.path ?? "";

	const pick = async () => {
		setError(null);
		const picked = await factory().pickCheckout();
		if (!picked) return;
		setCheckout(picked.path);
		setChosen(true);
		if (picked.repo) setRepo(picked.repo);
		else setError("That folder isn't a clone of a GitHub repository. Type owner/name, or choose another folder.");
	};
	const add = (name = repo, path = folder) => {
		if (!name.trim() || busy) return;
		setBusy(true);
		setError(null);
		// The import carries on in the background; its progress shows in the list.
		void factory().addRepo(name, path)
			.then(() => {
				setRepo("");
				setCheckout("");
				setChosen(false);
			})
			.catch((cause: unknown) => setError(errorText(cause)))
			.finally(() => setBusy(false));
	};
	const field = "h-8 min-w-0 rounded-md border bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-ring";

	return <div className={cn("space-y-2", className)}>
		<div className="flex gap-2">
			<Button variant="outline" size="sm" onClick={() => void pick()}><FolderOpen className="size-3.5" />Choose a local clone</Button>
			<input value={repo} onChange={(event) => setRepo(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="owner/name" aria-label="Repository" className={cn(field, "flex-1")} />
			<Button size="sm" disabled={!repo.trim() || busy} onClick={() => add()}>{busy ? "Adding…" : "Add and import"}</Button>
		</div>
		{folder && <p className="truncate text-2xs text-muted-foreground">
			{chosen ? "Clone" : "Found a clone"} at <span className="font-mono">{folder}</span>
			{!chosen && matches.length > 1 && <> · {matches.filter((clone) => clone.path !== folder).map((clone) => <button key={clone.path} type="button" onClick={() => setCheckout(clone.path)} className="ml-1 font-mono underline-offset-2 hover:text-foreground hover:underline">{clone.path}</button>)}</>}
		</p>}
		{error && <p className="text-xs text-destructive">{error}</p>}
		{found.length > 0 && <div className="pt-3">
			<div className="mb-1.5 text-xs text-muted-foreground">On this computer</div>
			<div className="divide-y rounded-md border">
				{(showAll ? found : found.slice(0, FOUND_SHOWN)).map((clone) => <div key={clone.path} className="flex items-center gap-3 px-3 py-2">
					<FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm">{clone.repo}</div>
						<div className="truncate font-mono text-2xs text-muted-foreground">{clone.path}</div>
					</div>
					<Button variant="outline" size="sm" disabled={busy} onClick={() => add(clone.repo, clone.path)}>Add</Button>
				</div>)}
			</div>
			{found.length > FOUND_SHOWN && <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1.5 text-xs text-muted-foreground hover:text-foreground">{showAll ? "Show fewer" : `Show all ${found.length}`}</button>}
		</div>}
	</div>;
}
