import { useEffect, useState } from "react";
import { SearchPalette } from "./components/SearchPalette";
import { TooltipProvider } from "./components/ui/tooltip";
import { useNarrow, useRoute, useSnapshot } from "./lib/useFactory";
import { TopBar } from "./shell/TopBar";

import { SettingsArea } from "./views/SettingsArea";
import { WorkItemView } from "./views/work/WorkItemView";
import { NewIssueView } from "./views/work/NewIssueView";
import { EmptyWork, WorkList } from "./views/work/WorkList";

function useTheme(theme: "system" | "light" | "dark" | undefined) {
	useEffect(() => {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || ((theme ?? "system") === "system" && query.matches));
		apply();
		query.addEventListener("change", apply);
		return () => query.removeEventListener("change", apply);
	}, [theme]);
}

/** Ctrl (Cmd on a Mac) with a key, from anywhere: N writes a new issue, K searches, comma opens settings. */
function useShortcuts(keys: Record<string, () => void>) {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const run = keys[event.key.toLowerCase()];
			if (run && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
				event.preventDefault();
				run();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [keys]);
}

export function App() {
	const snapshot = useSnapshot();
	const [route, setRoute] = useRoute();
	const [searching, setSearching] = useState(false);
	const narrow = useNarrow();
	useTheme(snapshot?.settings.theme);
	useShortcuts({ n: () => setRoute({ page: "new" }), k: () => setSearching((open) => !open), ",": () => setRoute({ page: "settings" }) });
	if (!snapshot) return null;

	const shown = snapshot.items.filter((item) => !snapshot.settings.showRepo || item.repo === snapshot.settings.showRepo);
	// In a narrow window the list fills it until an item is picked; then the item does, with a way back.
	const selected = snapshot.items.find((item) => item.id === route.item) ?? (narrow ? undefined : shown[0]);

	return <TooltipProvider>
		<div className="flex h-full flex-col">
			<TopBar snapshot={snapshot} route={route} onSearch={() => setSearching(true)} />
			{snapshot.error && <div className="border-b bg-destructive/5 px-4 py-2 text-sm text-destructive">{snapshot.error}</div>}
			<main className="flex min-h-0 flex-1">
				{route.page === "work" && <>
					{(!narrow || !selected) && <WorkList snapshot={snapshot} items={shown} selected={selected?.id} fill={narrow} />}
					{selected ? <WorkItemView key={selected.id} item={selected} snapshot={snapshot} route={route} narrow={narrow} /> : !narrow && <EmptyWork snapshot={snapshot} />}
				</>}
				{route.page === "new" && <>
					{!narrow && <WorkList snapshot={snapshot} items={shown} />}
					<NewIssueView snapshot={snapshot} />
				</>}

				{route.page === "settings" && <SettingsArea snapshot={snapshot} route={route} narrow={narrow} />}
			</main>
			<SearchPalette snapshot={snapshot} open={searching} onClose={() => setSearching(false)} />
		</div>
	</TooltipProvider>;
}
