import { useEffect, useState } from "react";
import type { GitReview } from "../../shared/workspace";
import { repositoryNameFrom, validRepositoryName } from "../../shared/gitWorkflow";
import { Select } from "../components/Select";
import { toastManager } from "../components/ui/toast";
import { useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { ipcError } from "./surfaceChrome";

/**
 * T3's Publish repository, inline in Git actions: a name (from the folder), the account or organisation, and private
 * or public. GitHub CLI creates it; the app adds it as origin and pushes the branch.
 */
export function PublishRepositoryForm({ projectId, folder, onDone, onCancel }: { projectId: string; folder: string; onDone: (review: GitReview) => void; onCancel: () => void }) {
	const { api } = useWorkspace();
	const [name, setName] = useState(() => repositoryNameFrom(folder));
	const [owners, setOwners] = useState<string[]>();
	const [owner, setOwner] = useState("");
	const [visibility, setVisibility] = useState<"private" | "public">("private");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.publishOwners(projectId).then(values => { if (!active) return; setOwners(values); setOwner(values[0] ?? ""); }, reason => { if (active) { setOwners([]); setError(ipcError(reason)); } });
		return () => { active = false; };
	}, [api, projectId]);
	const submit = async () => {
		if (!api || busy || !validRepositoryName(name) || !owner) return;
		setBusy(true); setError("");
		try {
			const result = await api.publishRepository(projectId, { name, owner, visibility });
			onDone(result.review);
			toastManager.add({ type: "success", title: `Published ${result.repository}`, description: result.pushed ? "The branch is pushed." : "Commit, then push to fill it.", timeout: 6000, actionProps: { children: "Open", onClick: () => void api.openLink(result.url) } });
		} catch (reason) { setError(ipcError(reason)); } finally { setBusy(false); }
	};
	return <form aria-label="Publish repository" className="flex flex-col gap-1.5 pt-1" onSubmit={event => { event.preventDefault(); void submit(); }}>
		<div className="flex items-center gap-1.5">
			{owners && owners.length > 1 ? <Select label="Owner" value={owner} onValueChange={setOwner} options={owners.map(value => ({ value, label: value }))} disabled={busy} /> : <span className="shrink-0 font-mono text-xs text-muted-foreground">{owner || "…"}</span>}
			<span className="text-muted-foreground">/</span>
			<input autoFocus aria-label="Repository name" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Escape") onCancel(); }}
				className={cn("h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus:border-ring", name && !validRepositoryName(name) && "border-destructive")} />
		</div>
		<div role="radiogroup" aria-label="Visibility" className="flex items-center gap-1">
			{(["private", "public"] as const).map(value => <button key={value} type="button" role="radio" aria-checked={visibility === value} onClick={() => setVisibility(value)}
				className={cn("h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/60", visibility === value && "bg-accent text-foreground")}>{value === "private" ? "Private" : "Public"}</button>)}
			<button type="button" onClick={onCancel} className="ml-auto h-7 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent/60">Cancel</button>
			<button type="submit" disabled={busy || !owner || !validRepositoryName(name)} className="h-7 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Publishing…" : "Publish"}</button>
		</div>
		{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
	</form>;
}
