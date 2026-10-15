import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import type { AccountStatus, Harness } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { HarnessLogo } from "../components/HarnessLogo";
import { SettingsButton, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection } from "./SettingsLayout";
import { UsageMeters } from "./UsageMeters";

type Checkable = "codex" | "claude" | "cursor" | "grok";
type Source = { key: string; harness: Checkable; accountId?: string; title: string; description: string };
const names: Record<Checkable, string> = { codex: "Codex", claude: "Claude Code", cursor: "Cursor", grok: "Grok" };

/** Plans and limit windows for every subscription the app can check, read from each agent when the page opens. */
export function UsageSettings() {
	const { api, overview } = useWorkspace();
	const sources: Source[] = [
		{ key: "codex", harness: "codex", title: "Codex", description: "Your Codex login on this computer" },
		{ key: "claude", harness: "claude", title: "Claude Code", description: "Your Claude Code login on this computer" },
		...overview.accounts.filter(account => !account.archived && account.kind === "native" && (["codex", "claude", "cursor", "grok"] as Harness[]).includes(account.harness))
			.map(account => ({ key: account.id, harness: account.harness as Checkable, accountId: account.id, title: account.name, description: `${names[account.harness as Checkable]} account` })),
	];
	const [statuses, setStatuses] = useState<Record<string, AccountStatus | { error: string }>>({});
	const [checking, setChecking] = useState<Record<string, boolean>>({});
	const check = useCallback(async (source: Source) => {
		if (!api) return;
		setChecking(current => ({ ...current, [source.key]: true }));
		try { const status = await api.accountStatus(source.harness, source.accountId); setStatuses(current => ({ ...current, [source.key]: status })); }
		catch (reason) { setStatuses(current => ({ ...current, [source.key]: { error: errorText(reason) } })); }
		finally { setChecking(current => ({ ...current, [source.key]: false })); }
	}, [api]);
	const keys = sources.map(source => source.key).join("|");
	// Each check starts the agent briefly, so they run once per visit rather than on a timer.
	useEffect(() => { for (const source of sources) void check(source); }, [keys]);
	const busy = Object.values(checking).some(Boolean);
	return <SettingsPageLayout title="Usage & limits" description="What each subscription allows and how much is left, as reported by the agent."
		actions={<SettingsButton variant="ghost" disabled={busy || !api} onClick={() => { for (const source of sources) void check(source); }}><RotateCw className={busy ? "animate-spin" : undefined} />{busy ? "Checking…" : "Check again"}</SettingsButton>}>
		<SettingsSection title="Subscriptions">
			{sources.map(source => {
				const status = statuses[source.key];
				return <SettingsRow key={source.key} icon={<HarnessLogo harness={source.harness} />} title={source.title} description={source.description}
					control={checking[source.key] ? <span className="text-xs text-muted-foreground">Checking…</span> : undefined}>
					{status && "error" in status ? <p className="text-xs text-muted-foreground">{status.error}</p> : status ? <UsageMeters status={status} /> : null}
				</SettingsRow>;
			})}
			{!api && <SettingsNote>Open the desktop application to check usage.</SettingsNote>}
		</SettingsSection>
		<p className="px-0.5 text-xs text-muted-foreground">Phaseo API usage and credits are on your dashboard at phaseo.app.</p>
	</SettingsPageLayout>;
}
