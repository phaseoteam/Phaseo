import { useEffect, useState, useSyncExternalStore } from "react";
import { FolderOpen, GitBranchPlus, LoaderCircle, SquareCode } from "lucide-react";
import { errorText, useWorkspace } from "../app/workspace";
import type { EditorInstallation } from "../../shared/editors";
import { CommandGroup, CommandItem } from "../components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { SettingsButton, settingsInput } from "../settings/SettingsLayout";
import { showToast } from "../components/ui/toast";
import { cn } from "../lib/utils";

/** The editor Open in editor uses, shared with file chips (MessageChips' openProjectFile). */
const editorKey = "phaseo.desktop.editor";
const preferredEditor = () => { try { return JSON.parse(localStorage.getItem(editorKey) ?? "null") as string | null; } catch { return null; } };

/** Installed editors, favourite first, as T3's Open in picker lists them. */
export function editorChoices(editors: readonly EditorInstallation[], preferred: string | null) {
	const available = editors.filter(editor => editor.available);
	return [...available.filter(editor => editor.id === preferred), ...available.filter(editor => editor.id !== preferred)];
}

/** T3's Open in…: the chat's project in any installed editor, or its folder; the choice becomes the favourite. */
export function OpenProjectItems({ projectId, open, run }: { projectId: string; open: boolean; run: (action: () => void) => void }) {
	const [editors, setEditors] = useState<EditorInstallation[]>([]);
	useEffect(() => {
		if (!open) return;
		let active = true;
		void window.phaseoDesktop?.workspace.editors().then(value => { if (active) setEditors(value); }, () => undefined);
		return () => { active = false; };
	}, [open]);
	const launch = (editor: EditorInstallation["id"] | "file-manager", name: string) => run(() => {
		if (editor !== "file-manager") localStorage.setItem(editorKey, JSON.stringify(editor));
		void window.phaseoDesktop?.workspace.openProject(projectId, { editor }).catch(reason => showToast("error", `Could not open the project in ${name}`, errorText(reason)));
	});
	const preferred = preferredEditor();
	return <CommandGroup heading="Open project">
		{editorChoices(editors, preferred).map(editor => <CommandItem key={editor.id} value={`Open project in ${editor.name} editor`} onSelect={() => launch(editor.id, editor.name)}><SquareCode />Open in {editor.name}{editor.id === preferred && <span className="ml-auto text-xs text-muted-foreground">Favourite</span>}</CommandItem>)}
		<CommandItem value="Open project folder file manager explorer finder reveal" onSelect={() => launch("file-manager", "the file manager")}><FolderOpen />Open project folder</CommandItem>
	</CommandGroup>;
}

let cloneOpen = false;
const listeners = new Set<() => void>();
export function openCloneProject(value = true) { cloneOpen = value; for (const listener of listeners) listener(); }
const useCloneOpen = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => cloneOpen);

/** T3's Clone from a remote URL: paste an address, choose a folder, and the checkout opens as a project in Code. */
export function CloneProjectDialog() {
	const open = useCloneOpen();
	const { setOverview, setMode, setNewChatProjectId, select } = useWorkspace();
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const close = () => { openCloneProject(false); setUrl(""); setError(""); };
	const clone = async () => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || busy) return;
		setBusy(true); setError("");
		try {
			const result = await api.cloneProject(url.trim());
			if (!result) return;
			setOverview(result.workspace); setMode("code"); setNewChatProjectId(result.projectId); select(undefined);
			showToast("success", "Repository cloned", result.workspace.projects.find(project => project.id === result.projectId)?.name);
			close();
		} catch (reason) { setError(errorText(reason)); }
		finally { setBusy(false); }
	};
	return <Dialog open={open} onOpenChange={value => { if (!value && !busy) close(); }}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader><DialogTitle>Clone a repository</DialogTitle><DialogDescription>Paste its address. You choose the folder next, and the copy opens as a project.</DialogDescription></DialogHeader>
			<form onSubmit={event => { event.preventDefault(); void clone(); }} className="flex flex-col gap-2">
				<input autoFocus value={url} disabled={busy} onChange={event => setUrl(event.target.value)} aria-label="Repository address" placeholder="https://github.com/owner/repository.git" spellCheck={false} className={cn(settingsInput, "h-9 font-mono text-[12.5px]")} />
				{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
				{busy && <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Cloning… Large repositories take a while.</p>}
				<DialogFooter className="mt-2"><SettingsButton variant="ghost" disabled={busy} onClick={close}>Cancel</SettingsButton><SettingsButton type="submit" variant="primary" disabled={busy || !url.trim()}><GitBranchPlus className="size-3.5" />Clone</SettingsButton></DialogFooter>
			</form>
		</DialogContent>
	</Dialog>;
}
