import { useEffect } from "react";
import { X } from "lucide-react";
import { useWorkspace, WorkspaceProvider } from "./app/workspace";
import { Titlebar } from "./shell/Titlebar";
import { Sidebar } from "./shell/Sidebar";
import { RightPanel } from "./shell/RightPanel";
import { CommandPalette } from "./shell/CommandPalette";
import { SettingsDialog } from "./settings/SettingsDialog";
import { NewChat } from "./chat/NewChat";
import { ChatView } from "./chat/ChatView";
import { CompareView } from "./chat/CompareView";

function useShortcuts() {
	const { setCommandsOpen, select, openSettings, setMode, setSidebarOpen, setRightPanel, rightPanel } = useWorkspace();
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
			const key = event.key.toLowerCase();
			const actions: Record<string, () => void> = {
				k: () => setCommandsOpen(open => !open),
				n: () => select(undefined),
				",": () => openSettings(),
				"1": () => setMode("chat"),
				"2": () => setMode("code"),
				b: () => setSidebarOpen(open => !open),
				j: () => setRightPanel(rightPanel === "terminal" ? undefined : "terminal"),
			};
			const action = actions[key];
			if (!action || event.shiftKey) return;
			event.preventDefault();
			if (!event.repeat) action();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [setCommandsOpen, select, openSettings, setMode, setSidebarOpen, setRightPanel, rightPanel]);
}

function Main() {
	const { selectedId, compareId, compareGroups } = useWorkspace();
	const group = compareGroups.find(value => value.id === compareId);
	if (group) return <CompareView key={group.id} group={group} />;
	if (selectedId) return <ChatView key={selectedId} id={selectedId} />;
	return <NewChat />;
}

function ErrorBanner() {
	const { error, setError } = useWorkspace();
	if (!error) return null;
	return <div role="alert" className="absolute bottom-24 left-1/2 z-40 flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-xl border border-destructive/30 bg-popover px-4 py-3 text-[13px] shadow-lg">
		<span className="min-w-0 flex-1 whitespace-pre-wrap text-destructive">{error}</span>
		<button type="button" aria-label="Dismiss" onClick={() => setError("")} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
	</div>;
}

function Shell() {
	const { sidebarOpen } = useWorkspace();
	useShortcuts();
	return <div className="flex h-full flex-col">
		<Titlebar />
		<div className="relative flex min-h-0 flex-1">
			{sidebarOpen && <Sidebar />}
			<main className="min-w-0 flex-1 bg-background"><Main /></main>
			<RightPanel />
			<ErrorBanner />
		</div>
		<CommandPalette />
		<SettingsDialog />
	</div>;
}

export function App() {
	return <WorkspaceProvider><Shell /></WorkspaceProvider>;
}
