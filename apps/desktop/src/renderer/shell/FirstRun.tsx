import { useEffect, useState, type ReactNode } from "react";
import { Check, FolderPlus, KeyRound, MessageSquarePlus } from "lucide-react";
import { errorText, usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import { cn } from "../lib/utils";
import { shortcut } from "../lib/keybindings";

export const firstRunKey = "phaseo.desktop.onboarded";
const done = () => { try { return localStorage.getItem(firstRunKey) !== null; } catch { return true; } };
const finish = () => { try { localStorage.setItem(firstRunKey, new Date().toISOString()); } catch { /* It shows again next launch. */ } };

function Step({ number, title, description, complete, children }: { number: number; title: string; description: string; complete: boolean; children: ReactNode }) {
	return <li className="flex items-start gap-3 py-3">
		<span aria-hidden className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold", complete ? "border-success bg-success text-background" : "border-border text-muted-foreground")}>{complete ? <Check className="size-3.5" /> : number}</span>
		<div className="min-w-0 flex-1">
			<p className="text-sm font-medium">{title}{complete && <span className="sr-only"> (done)</span>}</p>
			<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
		</div>
		<div className="shrink-0">{children}</div>
	</li>;
}

function Steps({ onClose }: { onClose: () => void }) {
	const { overview, api, setOverview, setError, openSettings, setMode, select } = useWorkspace();
	const connected = useConnectedHarnesses();
	const signedIn = usablePhaseoAccounts(overview).length > 0 || connected.size > 0, hasProject = overview.projects.length > 0;
	const addProject = () => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); };
	return <>
		<ol className="divide-y divide-border/60">
			<Step number={1} title="Connect an agent" description="Sign in to Phaseo, or use Codex, Claude Code and the other agents already signed in on this computer." complete={signedIn}>
				<Button size="sm" variant={signedIn ? "ghost" : "default"} onClick={() => { onClose(); openSettings("accounts"); }}><KeyRound />Accounts</Button>
			</Step>
			<Step number={2} title="Add a project" description="A folder the agents can read and change. Skip it to just chat." complete={hasProject}>
				<Button size="sm" variant={hasProject ? "ghost" : "outline"} onClick={addProject}><FolderPlus />Add a folder…</Button>
			</Step>
			<Step number={3} title="Start a chat" description={`Ask for anything. In Code, the agent works in your project.${shortcut("commandPalette.toggle") ? ` ${shortcut("commandPalette.toggle")} finds every command.` : ""}`} complete={false}>
				<Button size="sm" variant="outline" disabled={!signedIn} onClick={() => { onClose(); setMode(hasProject ? "code" : "chat"); select(undefined); }}><MessageSquarePlus />Start</Button>
			</Step>
		</ol>
	</>;
}

/**
 * The welcome on a fresh install: shown once, in an installed build, when the workspace has no chats and no projects. Anyone who already
 * uses the app never sees it; closing or skipping it ends it for good.
 */
export function FirstRun() {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const desktop = window.phaseoDesktop, api = desktop?.workspace;
		if (done() || !desktop || !api) return;
		let active = true;
		// Installed builds only: development runs and the test suites start from empty profiles too.
		void Promise.all([desktop.getRuntimeInfo(), api.overview()]).then(([runtime, overview]) => {
			if (!active || !runtime.isPackaged) return;
			if (overview.tasks.length || overview.projects.length) finish(); else setOpen(true);
		}, () => undefined);
		return () => { active = false; };
	}, []);
	const close = () => { finish(); setOpen(false); };
	return <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
		<DialogContent data-first-run className="sm:max-w-lg">
			<DialogHeader>
				<DialogTitle>Welcome to Phaseo</DialogTitle>
				<DialogDescription>Three steps to your first chat. You can come back to any of them later in Settings.</DialogDescription>
			</DialogHeader>
			{open && <Steps onClose={close} />}
			<DialogFooter><Button variant="ghost" onClick={close}>Skip for now</Button></DialogFooter>
		</DialogContent>
	</Dialog>;
}
