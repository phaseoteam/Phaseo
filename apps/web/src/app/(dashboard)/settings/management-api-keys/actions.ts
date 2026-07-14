"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { hmacSecret, makeManagementKeyV1 } from "@/lib/keygen";
import { enforceTeamKeyLimit } from "@/lib/server/teamLimits";
import { resolveActiveKeyPepper } from "@/lib/server/keyPepper";
import {
	CONTROL_SCOPES,
	MANAGEMENT_KEY_TEMPLATE_SCOPES,
	managementKeyScopes,
	type ManagementKeyTemplate,
} from "@/lib/managementKeyScopes";
import {
	requireActingUser,
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";

export type ManagementKeyLimitPayload = {
	dailyRequests?: number | null;
	weeklyRequests?: number | null;
	monthlyRequests?: number | null;
	dailyCostNanos?: number | null;
	weeklyCostNanos?: number | null;
	monthlyCostNanos?: number | null;
	softBlocked?: boolean;
};

export type CreateManagementKeyInput = {
	name: string;
	creatorUserId: string;
	workspaceId: string;
	template?: "read-only" | "read-write" | "full-control";
	scopes?: string[];
	expiresAt?: string | null;
};

export type UpdateManagementKeyInput = {
	name?: string;
	paused?: boolean;
	expiresAt?: string | null;
};

export type { ManagementKeyTemplate } from "@/lib/managementKeyScopes";


function parseOptionalExpiry(expiresAt: string | null | undefined): string | null | undefined {
	if (expiresAt === undefined) return undefined;
	if (expiresAt === null || String(expiresAt).trim() === "") {
		return null;
	}

	const parsed = new Date(expiresAt);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error("Invalid expiry time");
	}

	return parsed.toISOString();
}

export async function createManagementKeyAction(
	input: CreateManagementKeyInput
) {
	const { name, creatorUserId, workspaceId, template, scopes, expiresAt } = input;

	if (!name || typeof name !== "string") {
		throw new Error("Name is required");
	}
	if (!creatorUserId || typeof creatorUserId !== "string") {
		throw new Error("Creator user ID is required");
	}
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Workspace ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	requireActingUser(creatorUserId, user.id);
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);
	await enforceTeamKeyLimit(supabase as any, workspaceId);
	const { kid, secret, plaintext, prefix } = makeManagementKeyV1();
	const hash = hmacSecret(secret, resolveActiveKeyPepper());
	if (template !== undefined && scopes !== undefined) {
		throw new Error("Provide either an access template or explicit scopes, not both");
	}
	if (template === undefined && scopes === undefined) {
		throw new Error("Select an access template or explicit scopes");
	}
	if (template !== undefined && !(template in MANAGEMENT_KEY_TEMPLATE_SCOPES)) {
		throw new Error("Unsupported management key access template");
	}
	const resolvedScopes = template ? managementKeyScopes(template) : scopes!;
	if (resolvedScopes.length === 0) {
		throw new Error("At least one management scope is required");
	}
	const unsupportedScope = resolvedScopes.find((scope) => !CONTROL_SCOPES.includes(scope as (typeof CONTROL_SCOPES)[number]));
	if (unsupportedScope) {
		throw new Error(`Unsupported management scope: ${unsupportedScope}`);
	}
	const { data, error } = await supabase
		.from("management_keys")
		.insert({
			workspace_id: workspaceId,
			name: name.trim(),
			kid,
			hash,
			prefix,
			status: "active",
			scopes: JSON.stringify(resolvedScopes),
			expires_at: parseOptionalExpiry(expiresAt) ?? null,
			created_by: creatorUserId,
			created_at: new Date().toISOString(),
		})
		.select("id, created_at")
		.maybeSingle();
	if (error) throw new Error(`Failed to create management API key: ${error.message}`);

	revalidatePath("/settings/management-api-keys");

	return {
		id: data?.id,
		plaintext,
		prefix,
		createdAt: data?.created_at,
	};
}

export async function updateManagementKeyAction(
	id: string,
	updates: UpdateManagementKeyInput
) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	const { data: keyRow, error: keyErr } = await supabase
		.from("management_keys")
		.select("workspace_id")
		.eq("id", id)
		.maybeSingle();
	if (keyErr) throw keyErr;
	if (!keyRow?.workspace_id) throw new Error("Management API key not found");
	await requireWorkspaceMembership(supabase, user.id, keyRow.workspace_id, ["owner", "admin"]);

	const updateObj: Record<string, unknown> = {};

	if (typeof updates.name === "string") {
		if (updates.name.trim().length === 0) {
			throw new Error("Name cannot be empty");
		}
		updateObj.name = updates.name.trim();
	}

	if (typeof updates.paused === "boolean") {
		updateObj.status = updates.paused ? "paused" : "active";
	}

	const parsedExpiresAt = parseOptionalExpiry(updates.expiresAt);
	if (parsedExpiresAt !== undefined) {
		updateObj.expires_at = parsedExpiresAt;
	}

	if (Object.keys(updateObj).length === 0) {
		return { success: true, message: "No changes to apply" };
	}

	const { error } = await supabase
		.from("management_keys")
		.update(updateObj)
		.eq("id", id)
		.eq("workspace_id", keyRow.workspace_id);

	if (error) {
		console.error("Failed to update management API key:", error);
		throw new Error(`Failed to update management API key: ${error.message}`);
	}

	revalidatePath("/settings/management-api-keys");

	return { success: true };
}

export async function updateManagementKeyScopesAction(
	id: string,
	template: ManagementKeyTemplate,
) {
	if (!id || typeof id !== "string") throw new Error("Valid key ID is required");
	const { supabase, user } = await requireAuthenticatedUser();
	const { data: keyRow, error: keyErr } = await supabase
		.from("management_keys")
		.select("workspace_id")
		.eq("id", id)
		.maybeSingle();
	if (keyErr) throw keyErr;
	if (!keyRow?.workspace_id) throw new Error("Management API key not found");
	await requireWorkspaceMembership(supabase, user.id, keyRow.workspace_id, ["owner", "admin"]);

	const { error } = await supabase
		.from("management_keys")
		.update({ scopes: JSON.stringify(managementKeyScopes(template)) })
		.eq("id", id)
		.eq("workspace_id", keyRow.workspace_id);
	if (error) throw new Error(`Failed to update management API key scopes: ${error.message}`);
	revalidatePath("/settings/management-api-keys");
	return { success: true };
}

export async function updateManagementKeyLimitsAction(
	id: string,
	payload: ManagementKeyLimitPayload
) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	const { data: keyRow, error: keyErr } = await supabase
		.from("management_keys")
		.select("workspace_id")
		.eq("id", id)
		.maybeSingle();
	if (keyErr) throw keyErr;
	if (!keyRow?.workspace_id) throw new Error("Management API key not found");
	await requireWorkspaceMembership(supabase, user.id, keyRow.workspace_id, ["owner", "admin"]);

	const updateObj: Record<string, unknown> = {
		daily_limit_requests: payload.dailyRequests ?? null,
		weekly_limit_requests: payload.weeklyRequests ?? null,
		monthly_limit_requests: payload.monthlyRequests ?? null,
		daily_limit_cost_nanos: payload.dailyCostNanos ?? null,
		weekly_limit_cost_nanos: payload.weeklyCostNanos ?? null,
		monthly_limit_cost_nanos: payload.monthlyCostNanos ?? null,
	};

	if (typeof payload.softBlocked === "boolean") {
		updateObj.soft_blocked = payload.softBlocked;
	} else {
		updateObj.soft_blocked = null;
	}

	const { error } = await supabase
		.from("management_keys")
		.update(updateObj)
		.eq("id", id)
		.eq("workspace_id", keyRow.workspace_id);

	if (error) {
		console.error("Failed to update management API key limits:", error);
		throw new Error(
			`Failed to update management API key limits: ${error.message}`
		);
	}

	revalidatePath("/settings/management-api-keys");

	return { success: true };
}

export async function deleteManagementKeyAction(
	id: string,
	confirmName?: string
) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	const { data: keyRow, error: keyErr } = await supabase
		.from("management_keys")
		.select("workspace_id, name")
		.eq("id", id)
		.maybeSingle();
	if (keyErr) throw keyErr;
	if (!keyRow?.workspace_id) throw new Error("Management API key not found");
	await requireWorkspaceMembership(supabase, user.id, keyRow.workspace_id, ["owner", "admin"]);

	// If confirmation is required, verify the name matches
	if (confirmName) {
		if (keyRow.name !== confirmName) {
			throw new Error(
				"Confirmation failed: Key name does not match"
			);
		}
	}

	const { error } = await supabase
		.from("management_keys")
		.delete()
		.eq("id", id)
		.eq("workspace_id", keyRow.workspace_id);

	if (error) {
		console.error("Failed to delete management API key:", error);
		throw new Error(`Failed to delete management API key: ${error.message}`);
	}

	revalidatePath("/settings/management-api-keys");

	return { success: true };
}

export async function getManagementKeyById(id: string) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();

	const { data, error } = await supabase
		.from("management_keys")
		.select("*")
		.eq("id", id)
		.maybeSingle();
	if (data?.workspace_id) {
		await requireWorkspaceMembership(supabase, user.id, data.workspace_id, ["owner", "admin"]);
	}

	if (error) {
		console.error("Failed to fetch management API key:", error);
		throw new Error(`Failed to fetch management API key: ${error.message}`);
	}

	return data;
}

export async function listManagementKeysByTeam(workspaceId: string) {
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Valid workspace ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	const { data, error } = await supabase
		.from("management_keys")
		.select("*")
		.eq("workspace_id", workspaceId)
		.order("created_at", { ascending: false });

	if (error) {
		console.error("Failed to list management API keys:", error);
		throw new Error(`Failed to list management API keys: ${error.message}`);
	}

	return data;
}

