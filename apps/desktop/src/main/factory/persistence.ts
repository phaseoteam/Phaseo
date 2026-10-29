import { cp, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentProfile, FactorySettings, Playbook, PlaybookRule, RepoNote, Run, StageId, WorkKind } from "../../shared/factory/types";
import type { WorkspaceStore } from "../workspaceStore";
import { legacyAgent } from "./agents";
import type { FactoryPersistence, ItemOverlay, SavedState } from "./store";

/**
 * Factory's state lives in the desktop's database (the factory_state table): `state` is its settings, item overlays,
 * runs, notes and item threads; `items` what it last read from GitHub; `imported` that the old Factory app's file was
 * looked for. The old app's files are only ever read.
 */

export function factoryPersistence(store: Pick<WorkspaceStore, "factoryState" | "saveFactoryState">): FactoryPersistence {
	return { read: (key) => store.factoryState(key), write: (entries) => store.saveFactoryState(entries as Record<string, string>) };
}

/** The old Factory app's data folder: Electron's userData for an app named "Phaseo Factory". */
export const legacyFactoryFolder = (appData: string) => path.join(appData, "Phaseo Factory");

/** The old app's saved state and item cache, read and never changed: its last good file, or the backup it kept. */
export async function readLegacyFactory(folder: string): Promise<{ state?: unknown; items?: string }> {
	const json = async (file: string) => {
		try {
			return JSON.parse(await readFile(file, "utf8")) as unknown;
		} catch {
			return undefined;
		}
	};
	const state = (await json(path.join(folder, "factory.json"))) ?? (await json(path.join(folder, "factory.json.bak")));
	const items = await json(path.join(folder, "items.json"));
	return { ...(state && typeof state === "object" ? { state } : {}), ...(items && typeof items === "object" ? { items: JSON.stringify(items) } : {}) };
}

type LegacySettings = Partial<FactorySettings> & { repo?: string; repoPath?: string; hubUrl?: string; hubKey?: string; hubKeySealed?: string; theme?: string; liveUpdates?: boolean };
type LegacyState = { settings?: LegacySettings; overlays?: Record<string, ItemOverlay>; runs?: Run[]; notes?: Record<string, RepoNote[]>; chats?: unknown };

/**
 * The old app's state in this app's shape. Agent ids become the desktop's where an agent of the same harness and model
 * is on this computer, and are left out otherwise (unassigned), except on past runs, which keep theirs as history.
 * Nothing imported starts on its own: runs that were going are recorded as stopped and never carried on. Chats, the
 * hub and the theme have no place here and are dropped.
 */
export function importLegacyState(raw: unknown, agents: AgentProfile[], now = Date.now()): SavedState | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const legacy = raw as LegacyState;
	const known = new Map<string, string | undefined>();
	const map = (id: string | undefined) => {
		if (!id) return undefined;
		if (!known.has(id)) known.set(id, legacyAgent(id, agents));
		return known.get(id);
	};
	const stageAgents = (value: Partial<Record<StageId, string>> | undefined) => Object.fromEntries(Object.entries(value ?? {}).flatMap(([stage, id]) => {
		const mapped = map(id);
		return mapped ? [[stage, mapped]] : [];
	})) as Partial<Record<StageId, string>>;
	const playbook = (value: Playbook | undefined): Playbook | undefined => value && {
		...value,
		agentId: map(value.agentId),
		stageAgents: stageAgents(value.stageAgents),
		rules: (value.rules ?? []).map((rule): PlaybookRule => ({ ...rule, agentId: map(rule.agentId), stageAgents: stageAgents(rule.stageAgents) })),
	};
	const { repo, repoPath, hubUrl, hubKey, hubKeySealed, theme, liveUpdates, ...settings } = legacy.settings ?? {};
	void hubUrl; void hubKey; void hubKeySealed; void theme; void liveUpdates;
	const playbooks = settings.playbooks ? { issue: playbook(settings.playbooks.issue), pull: playbook(settings.playbooks.pull) } : undefined;
	const efforts = Object.fromEntries(Object.entries(settings.agentEfforts ?? {}).flatMap(([id, effort]) => {
		const mapped = map(id);
		return mapped ? [[mapped, effort]] : [];
	}));
	const overlays = Object.fromEntries(Object.entries(legacy.overlays ?? {}).map(([itemId, overlay]) => {
		const stages = overlay.stages && Object.fromEntries(Object.entries(overlay.stages).map(([stage, state]) => [stage, { ...state, agentId: map(state.agentId), ...(state.status === "running" || state.status === "queued" ? { status: "idle" as const } : {}) }]));
		// Autopilot carried on from runs that were going; nothing imported carries on.
		const { autopilot, ...rest } = overlay;
		void autopilot;
		return [itemId, { ...rest, assigneeId: map(overlay.assigneeId), ...(stages ? { stages: stages as ItemOverlay["stages"] } : {}) }];
	}));
	const runs = (legacy.runs ?? []).map((run): Run => {
		// The old app's sessions were its own processes': nothing here can carry them on.
		const { sessionId, pending, ...rest } = run;
		void sessionId; void pending;
		const going = run.status === "running";
		return { ...rest, agentId: map(run.agentId) ?? run.agentId, carriedOnAt: run.carriedOnAt ?? (going || run.interrupted ? now : undefined), ...(going ? { status: "cancelled", summary: "Factory closed while this was running", finishedAt: run.finishedAt ?? now } : {}) };
	});
	const repos = settings.repos ?? (repo ? [{ repo, path: repoPath ?? "", addedAt: 0 }] : []);
	return {
		settings: { ...settings, repos, showRepo: settings.showRepo ?? "", agentEfforts: efforts, ...(playbooks?.issue && playbooks.pull ? { playbooks: playbooks as Record<WorkKind, Playbook> } : {}) } as FactorySettings,
		overlays,
		runs,
		notes: legacy.notes ?? {},
		threads: {},
	};
}

/**
 * Once, on the first start with nothing saved: the old Factory app's state, if it left any. Records that it looked, so
 * it never imports twice, and never over state this app already has.
 */
export async function importLegacyOnce(store: Pick<WorkspaceStore, "factoryState" | "saveFactoryState">, folder: string, agents: () => Promise<AgentProfile[]>, dataDir?: string): Promise<"imported" | "none" | "skipped"> {
	if (store.factoryState("imported") !== undefined || store.factoryState("state") !== undefined) return "skipped";
	const legacy = await readLegacyFactory(folder);
	const state = legacy.state ? importLegacyState(legacy.state, await agents().catch(() => [])) : undefined;
	const record = JSON.stringify({ at: new Date().toISOString(), from: path.join(folder, "factory.json"), found: Boolean(state) });
	// Issues' attached images come too, copied: items refer to them by name under the attachments folder.
	if (state && dataDir) await cp(path.join(folder, "attachments"), path.join(dataDir, "attachments"), { recursive: true, force: false }).catch(() => undefined);
	store.saveFactoryState({ imported: record, ...(state ? { state: JSON.stringify(state) } : {}), ...(state && legacy.items ? { items: legacy.items } : {}) });
	return state ? "imported" : "none";
}
