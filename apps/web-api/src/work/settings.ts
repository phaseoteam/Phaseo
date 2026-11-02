import type { getDataClient } from "@/data/supabase";
import { DEFAULT_SLA_HOURS, MAX_SLA_HOURS, MIN_SLA_HOURS } from "./sla";
import type { WorkSettings, WorkSettingsRow, WorkSlaHours } from "./types";

// Work tracker settings per workspace (work_settings). A missing row means the defaults.

type DataClient = ReturnType<typeof getDataClient>;

export const DEFAULT_STALL_DAYS = 7;
export const MIN_STALL_DAYS = 1;
export const MAX_STALL_DAYS = 90;

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
	slaHours: { ...DEFAULT_SLA_HOURS },
	stallDays: DEFAULT_STALL_DAYS,
	ambientEnabled: false,
	supportDraftsEnabled: true,
	updatedAt: null,
};

const SLA_KEYS = ["1", "2", "3", "4"] as const;

function validHours(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= MIN_SLA_HOURS && value <= MAX_SLA_HOURS;
}

export function formatWorkSettings(row: Partial<WorkSettingsRow> | null | undefined): WorkSettings {
	if (!row) return { ...DEFAULT_WORK_SETTINGS, slaHours: { ...DEFAULT_SLA_HOURS } };
	const slaHours = { ...DEFAULT_SLA_HOURS };
	for (const key of SLA_KEYS) {
		const value = Number(row.sla_hours?.[key]);
		if (validHours(value)) slaHours[key] = value;
	}
	const stallDays = Number(row.stall_days);
	return {
		slaHours,
		stallDays: Number.isInteger(stallDays) && stallDays >= MIN_STALL_DAYS && stallDays <= MAX_STALL_DAYS ? stallDays : DEFAULT_STALL_DAYS,
		ambientEnabled: row.ambient_enabled === true,
		supportDraftsEnabled: row.support_drafts_enabled !== false,
		updatedAt: row.updated_at ?? null,
	};
}

/** The workspace's settings, or the defaults when there is no row. Throws when the read fails. */
export async function loadWorkSettings(client: DataClient, workspaceId: string): Promise<WorkSettings> {
	const { data, error } = await client.from("work_settings").select("*").eq("workspace_id", workspaceId).maybeSingle();
	if (error) throw new Error(`work_settings read failed: ${error.message}`);
	return formatWorkSettings(data as WorkSettingsRow | null);
}

/** The settings, or the defaults when the read fails (for side effects such as SLA times). */
export async function loadWorkSettingsOrDefaults(client: DataClient, workspaceId: string): Promise<WorkSettings> {
	try {
		return await loadWorkSettings(client, workspaceId);
	} catch {
		return formatWorkSettings(null);
	}
}

export type WorkSettingsInput = {
	slaHours?: Partial<WorkSlaHours>;
	stallDays?: number;
	ambientEnabled?: boolean;
	supportDraftsEnabled?: boolean;
};

/**
 * Validates a PUT /settings body: slaHours "1" to "4" between 1 and 2160 hours, stallDays a whole
 * number from 1 to 90, and the two switches as booleans. Missing fields keep the current value.
 */
export function parseWorkSettingsInput(body: Record<string, unknown>): { ok: true; value: WorkSettingsInput } | { ok: false; message: string } {
	const value: WorkSettingsInput = {};
	if (body.slaHours !== undefined) {
		if (!body.slaHours || typeof body.slaHours !== "object" || Array.isArray(body.slaHours)) return { ok: false, message: "slaHours must be an object of priority to hours" };
		const input = body.slaHours as Record<string, unknown>;
		const slaHours: Partial<WorkSlaHours> = {};
		for (const [key, hours] of Object.entries(input)) {
			if (!(SLA_KEYS as readonly string[]).includes(key)) return { ok: false, message: "slaHours keys must be priorities 1 to 4" };
			if (!validHours(hours)) return { ok: false, message: `slaHours must be between ${MIN_SLA_HOURS} and ${MAX_SLA_HOURS} hours` };
			slaHours[key as keyof WorkSlaHours] = hours;
		}
		value.slaHours = slaHours;
	}
	if (body.stallDays !== undefined) {
		if (typeof body.stallDays !== "number" || !Number.isInteger(body.stallDays) || body.stallDays < MIN_STALL_DAYS || body.stallDays > MAX_STALL_DAYS) {
			return { ok: false, message: `stallDays must be a whole number from ${MIN_STALL_DAYS} to ${MAX_STALL_DAYS}` };
		}
		value.stallDays = body.stallDays;
	}
	for (const field of ["ambientEnabled", "supportDraftsEnabled"] as const) {
		if (body[field] === undefined) continue;
		if (typeof body[field] !== "boolean") return { ok: false, message: `${field} must be true or false` };
		value[field] = body[field] as boolean;
	}
	return { ok: true, value };
}

/** Saves settings over the current ones (upsert of the workspace's row) and returns the result. */
export async function saveWorkSettings(client: DataClient, workspaceId: string, input: WorkSettingsInput, userId: string | null): Promise<WorkSettings> {
	const current = await loadWorkSettings(client, workspaceId);
	const row = {
		workspace_id: workspaceId,
		sla_hours: { ...current.slaHours, ...input.slaHours },
		stall_days: input.stallDays ?? current.stallDays,
		ambient_enabled: input.ambientEnabled ?? current.ambientEnabled,
		support_drafts_enabled: input.supportDraftsEnabled ?? current.supportDraftsEnabled,
		updated_by: userId,
		updated_at: new Date().toISOString(),
	};
	const { data, error } = await client.from("work_settings").upsert(row, { onConflict: "workspace_id" }).select("*").maybeSingle();
	if (error) throw new Error(`work_settings save failed: ${error.message}`);
	return formatWorkSettings((data as WorkSettingsRow | null) ?? row);
}
