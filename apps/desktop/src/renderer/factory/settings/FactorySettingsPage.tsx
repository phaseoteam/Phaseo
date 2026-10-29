import type { FactorySettingsPage as Page } from "../../app/workspace";
import { useSnapshot } from "../lib/useFactory";
import { NotesSettings } from "./NotesSettings";
import { PlaybookSettings } from "./PlaybooksView";
import { CheckingSettings, RepositoriesSettings } from "./RepositoriesSettings";

/** Factory's pages in Settings: repositories, the two playbooks, notes, and checking for new work. */
export function FactorySettingsPage({ page }: { page: Page }) {
	const snapshot = useSnapshot();
	if (!window.phaseoDesktop?.factory) return <p className="px-8 pt-12 text-sm text-muted-foreground">Factory runs in the desktop app.</p>;
	if (!snapshot) return <p className="px-8 pt-12 text-sm text-muted-foreground">Loading…</p>;
	if (page === "factory-repositories") return <RepositoriesSettings snapshot={snapshot} />;
	if (page === "factory-issues") return <PlaybookSettings key="issue" snapshot={snapshot} kind="issue" />;
	if (page === "factory-pulls") return <PlaybookSettings key="pull" snapshot={snapshot} kind="pull" />;
	if (page === "factory-notes") return <NotesSettings snapshot={snapshot} />;
	return <CheckingSettings snapshot={snapshot} />;
}
