import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import type { FactorySettings, FactorySnapshot } from "../../shared/types";
import { Markdown } from "../components/Markdown";
import { Choice, Group, Row, SettingsPage } from "../components/Settings";
import { Button } from "../components/ui/button";
import { Kbd } from "../components/ui/kbd";
import { since } from "../lib/format";
import { factory, useNow } from "../lib/useFactory";

const THEMES: { value: FactorySettings["theme"]; label: string }[] = [
	{ value: "system", label: "Match the system" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

export function GeneralSettings({ snapshot }: { snapshot: FactorySnapshot }) {
	return <SettingsPage title="General" description="How Factory looks on this computer, and which version it is.">
		<Group title="Appearance">
			<Row title="Theme" description="Match the system follows Windows' light or dark mode as it changes.">
				<Choice value={snapshot.settings.theme} options={THEMES} onChange={(theme) => void factory().updateSettings({ theme })} />
			</Row>
		</Group>
		<Updates update={snapshot.update} />
	</SettingsPage>;
}

/** The version running, and the newest one on GitHub: checked at the start and every six hours. */
function Updates({ update }: { update: FactorySnapshot["update"] }) {
	const now = useNow(30_000);
	const latest = update?.latest;
	const checked = update?.checkedAt ? `Checked ${since(update.checkedAt, now)}.` : "";
	const status = update?.checking ? "Checking GitHub for a newer version…"
		: update?.error ? `Couldn't check for updates: ${update.error}. ${checked}`
		: latest ? `Version ${latest.version}${latest.prerelease ? " (a pre-release)" : ""} is out${latest.publishedAt ? `, published ${since(latest.publishedAt, now)}` : ""}.`
		: update?.checkedAt ? `This is the newest version. ${checked}` : "Not checked yet.";
	return <Group title="Updates" description="New versions come out as releases of the Phaseo repository on GitHub.">
		<Row title={`Phaseo Factory ${update?.current ?? ""}`.trim()} description={status}>
			<div className="flex shrink-0 items-center gap-2">
				<Button variant="outline" size="sm" disabled={update?.checking} onClick={() => void factory().checkForUpdate()}>{update?.checking ? "Checking…" : "Check now"}</Button>
				{latest && <Button size="sm" onClick={() => void factory().openExternal(latest.download?.url ?? latest.url)}>
					<ArrowDownToLine className="size-3.5" />{latest.download ? `Download ${latest.version}` : "Get it on GitHub"}
				</Button>}
			</div>
		</Row>
		{latest && <div className="px-4 py-3.5">
			<div className="mb-2 flex items-center gap-2 text-sm font-medium">What's new in {latest.version}
				<button type="button" onClick={() => void factory().openExternal(latest.url)} className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground">The release on GitHub<ArrowUpRight className="size-3" /></button>
			</div>
			{latest.notes ? <Markdown source={latest.notes} repo={RELEASES_REPO} className="max-h-80 overflow-y-auto" /> : <p className="text-sm text-muted-foreground">This release has no notes.</p>}
			{latest.download && <p className="mt-3 text-xs text-muted-foreground">{latest.download.name}, {latest.download.bytes >= 1024 * 1024 ? `${(latest.download.bytes / 1024 / 1024).toFixed(0)} MB` : `${Math.max(1, Math.round(latest.download.bytes / 1024))} KB`}. Quit Factory and open it to install; your settings and runs stay as they are.</p>}
		</div>}
	</Group>;
}

/** Where releases are, for linking #123 in their notes. */
const RELEASES_REPO = "phaseoteam/Phaseo";

const SHORTCUTS = [
	{ keys: "Ctrl K", title: "Search", description: "Find work, runs, agents and settings." },
	{ keys: "Ctrl N", title: "New issue", description: "Write an issue from anywhere." },
	{ keys: "Ctrl ,", title: "Settings", description: "Open settings." },
	{ keys: "Esc", title: "Back to work", description: "Leave settings, or close search." },
];

export function ShortcutSettings() {
	return <SettingsPage title="Keyboard shortcuts" description="Ctrl on Windows and Linux, Cmd on a Mac.">
		<Group title="Everywhere">
			{SHORTCUTS.map((shortcut) => <Row key={shortcut.keys} title={shortcut.title} description={shortcut.description}><Kbd>{shortcut.keys}</Kbd></Row>)}
		</Group>
	</SettingsPage>;
}
