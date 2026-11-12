import type { WorkspacePreferences } from "../../shared/preferences";
import { readWorkspacePreferences } from "./workspacePreferences";

/** How often agent CLIs are re-checked for their version, sign-in and models (Settings → Agents → Health checks), in milliseconds; 0 never. */
export function providerHealthMs(preferences: WorkspacePreferences = readWorkspacePreferences()) {
	const minutes = preferences.threads.providerHealthMinutes;
	return minutes === null ? 0 : minutes * 60_000;
}
