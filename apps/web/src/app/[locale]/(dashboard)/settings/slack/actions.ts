"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { slackAgentSettingsEnabled } from "@/lib/flags";
import type { SlackAgentInstallation, SlackCustomApp } from "@/components/(gateway)/settings/slack/slackAgentForm";
import type { SlackAgentMemory, SlackAgentSkill } from "@/components/(gateway)/settings/slack/slackAgentMemory";
import type { SlackAgentSchedule, SlackAgentSchedules } from "@/components/(gateway)/settings/slack/slackAgentSchedules";

const PATH = "/api/account/settings/slack";
const SLACK_AUTHORIZE_ORIGIN = "https://slack.com";

export type SlackActionError = { ok: false; status: number | null; code: string | null; message: string | null };

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	if (!(await slackAgentSettingsEnabled())) throw new WebApiError(PATH, 404);
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WebApiError(PATH, 401, undefined, undefined, "unauthorized");
	if (!workspaceId) throw new WebApiError(PATH, 400, "Select a workspace first");
	return { accessToken, workspaceId };
}

// Server action errors are masked in production, so failures are returned.
function failure(error: unknown): SlackActionError {
	if (error instanceof WebApiError) {
		const code = error.code && /^[a-z_]+$/.test(error.code) ? error.code : null;
		const message = error.detail && error.detail !== code ? error.detail : null;
		return { ok: false, status: error.status, code, message };
	}
	return { ok: false, status: null, code: null, message: null };
}

function refresh(): void {
	revalidatePath("/settings/slack");
}

/** Starts an install: returns Slack's consent page for the browser to open. */
export async function startSlackInstall(settings: Record<string, unknown>) {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ url: string }>(`${PATH}/install`, context.accessToken, {
			method: "POST",
			body: JSON.stringify({ ...settings, workspaceId: context.workspaceId }),
		});
		// Only ever send the browser to Slack's own consent page.
		const url = new URL(result.url);
		if (url.origin !== SLACK_AUTHORIZE_ORIGIN) throw new WebApiError(`${PATH}/install`, 502);
		return { ok: true as const, url: url.toString() };
	} catch (error) {
		return failure(error);
	}
}

/**
 * Update Slack permissions: Slack's consent page for the live installation, which
 * asks for the scopes it lacks and keeps its settings, key and data.
 */
export async function startSlackPermissionsUpdate() {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ url: string }>(`${PATH}/permissions`, context.accessToken, {
			method: "POST",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		const url = new URL(result.url);
		if (url.origin !== SLACK_AUTHORIZE_ORIGIN) throw new WebApiError(`${PATH}/permissions`, 502);
		return { ok: true as const, url: url.toString() };
	} catch (error) {
		return failure(error);
	}
}

export async function updateSlackAgent(patch: Record<string, unknown>) {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ installation: SlackAgentInstallation }>(PATH, context.accessToken, {
			method: "PATCH",
			body: JSON.stringify({ ...patch, workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true as const, installation: result.installation };
	} catch (error) {
		return failure(error);
	}
}

export async function uninstallSlackAgent() {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ uninstalled: boolean; slack_uninstalled: boolean }>(PATH, context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true as const, slackUninstalled: result.slack_uninstalled };
	} catch (error) {
		return failure(error);
	}
}

export async function saveSlackCustomApp(app: Record<string, string>) {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ custom_app: SlackCustomApp }>(`${PATH}/custom-app`, context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ ...app, workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true as const, customApp: result.custom_app };
	} catch (error) {
		return failure(error);
	}
}

export async function removeSlackCustomApp() {
	try {
		const context = await account();
		await fetchAccountWebApi(`${PATH}/custom-app`, context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		refresh();
		return { ok: true as const };
	} catch (error) {
		return failure(error);
	}
}

const MEMORY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMORY_KINDS = new Set(["note", "pin", "todo"]);

/** A note's or skill's path; only an id goes into it. */
function memoryPath(collection: "notes" | "skills", id: string): `/api/account/${string}` {
	if (!MEMORY_ID_PATTERN.test(id)) throw new WebApiError(`${PATH}/memory`, 400, "Not a valid id", undefined, "bad_request");
	return `${PATH}/memory/${collection}/${id}`;
}

/** What the agent remembers: its notes (all, or one kind) and its saved skills. */
export async function loadSlackAgentMemory(kind: string) {
	try {
		const context = await account();
		const query = new URLSearchParams({ workspaceId: context.workspaceId });
		if (MEMORY_KINDS.has(kind)) query.set("kind", kind);
		const memory = await fetchAccountWebApi<SlackAgentMemory>(`${PATH}/memory?${query}`, context.accessToken);
		return { ok: true as const, memory };
	} catch (error) {
		return failure(error);
	}
}

export async function deleteSlackAgentNote(id: string) {
	try {
		const context = await account();
		await fetchAccountWebApi(memoryPath("notes", id), context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		return { ok: true as const };
	} catch (error) {
		return failure(error);
	}
}

export async function updateSlackAgentSkill(id: string, patch: Record<string, string>) {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ skill: SlackAgentSkill }>(memoryPath("skills", id), context.accessToken, {
			method: "PATCH",
			body: JSON.stringify({ ...patch, workspaceId: context.workspaceId }),
		});
		return { ok: true as const, skill: result.skill };
	} catch (error) {
		return failure(error);
	}
}

export async function deleteSlackAgentSkill(id: string) {
	try {
		const context = await account();
		await fetchAccountWebApi(memoryPath("skills", id), context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		return { ok: true as const };
	} catch (error) {
		return failure(error);
	}
}

/** A schedule's path; only an id goes into it. */
function schedulePath(id: string): `/api/account/${string}` {
	if (!MEMORY_ID_PATTERN.test(id)) throw new WebApiError(`${PATH}/schedules`, 400, "Not a valid id", undefined, "bad_request");
	return `${PATH}/schedules/${id}`;
}

/** The workspace's recurring tasks, with the admins' settings. */
export async function loadSlackAgentSchedules() {
	try {
		const context = await account();
		const schedules = await fetchAccountWebApi<SlackAgentSchedules>(`${PATH}/schedules?${new URLSearchParams({ workspaceId: context.workspaceId })}`, context.accessToken);
		return { ok: true as const, schedules };
	} catch (error) {
		return failure(error);
	}
}

export async function setSlackAgentScheduleStatus(id: string, status: "active" | "paused") {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ schedule: SlackAgentSchedule }>(schedulePath(id), context.accessToken, {
			method: "PATCH",
			body: JSON.stringify({ status, workspaceId: context.workspaceId }),
		});
		return { ok: true as const, schedule: result.schedule };
	} catch (error) {
		return failure(error);
	}
}

export async function deleteSlackAgentSchedule(id: string) {
	try {
		const context = await account();
		await fetchAccountWebApi(schedulePath(id), context.accessToken, {
			method: "DELETE",
			body: JSON.stringify({ workspaceId: context.workspaceId }),
		});
		return { ok: true as const };
	} catch (error) {
		return failure(error);
	}
}
