"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { makeKeyV2, hmacSecret } from "@/lib/keygen";
import {
	requireActingUser,
	requireAuthenticatedUser,
	requireTeamMembership,
} from "@/utils/serverActionAuth";

export type ProvisioningKeyLimitPayload = {
	dailyRequests?: number | null;
	weeklyRequests?: number | null;
	monthlyRequests?: number | null;
	dailyCostNanos?: number | null;
	weeklyCostNanos?: number | null;
	monthlyCostNanos?: number | null;
	softBlocked?: boolean;
};

export type CreateProvisioningKeyInput = {
	name: string;
	creatorUserId: string;
	teamId: string;
	scopes?: string;
};

export type UpdateProvisioningKeyInput = {
	name?: string;
	paused?: boolean;
};

export async function createProvisioningKeyAction(
	input: CreateProvisioningKeyInput
) {
	const { name, creatorUserId, teamId, scopes = "[]" } = input;

	if (!name || typeof name !== "string") {
		throw new Error("Name is required");
	}
	if (!creatorUserId || typeof creatorUserId !== "string") {
		throw new Error("Creator user ID is required");
	}
	if (!teamId || typeof teamId !== "string") {
		throw new Error("Team ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	requireActingUser(creatorUserId, user.id);
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	// Generate secure key
	const { kid, secret, plaintext, prefix } = makeKeyV2();

	const pepper = process.env.KEY_PEPPER;
	if (!pepper) {
		throw new Error("Server configuration error: KEY_PEPPER not set");
	}

	const hash = hmacSecret(secret, pepper);

	const insertObj = {
		team_id: teamId,
		name: name.trim(),
		kid,
		hash,
		prefix,
		status: "active",
		scopes,
		created_by: creatorUserId,
		is_provisioning: true,
		created_at: new Date().toISOString(),
	};

	const { data, error } = await supabase
		.from("provisioning_keys")
		.insert(insertObj)
		.select("id, created_at")
		.maybeSingle();

	if (error) {
		console.error("Failed to create management API key:", error);
		throw new Error(`Failed to create management API key: ${error.message}`);
	}

	revalidatePath("/settings/management-api-keys");

	return {
		id: data?.id,
		plaintext,
		prefix,
		createdAt: data?.created_at,
	};
}

export async function updateProvisioningKeyAction(
	id: string,
	updates: UpdateProvisioningKeyInput
) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	const { data: keyRow, error: keyErr } = await supabase
		.from("provisioning_keys")
		.select("team_id")
		.eq("id", id)
		.maybeSingle();
	if (keyErr) throw keyErr;
	if (!keyRow?.team_id) throw new Error("Management API key not found");
	await requireTeamMembership(supabase, user.id, keyRow.team_id, ["owner", "admin"]);

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

	if (Object.keys(updateObj).length === 0) {
		return { success: true, message: "No changes to apply" };
	}

	const { error } = await supabase
		.from("provisioning_keys")
		.update(updateObj)
		.eq("id", id)
		.eq("team_id", keyRow.team_id);

	if (error) {
		console.error("Failed to update management API key:", error);
		throw new Error(`Failed to update management API key: ${error.message}`);
	}

	revalidatePath("/settings/management-api-keys");

	return { success: true };
}

export async function updateProvisioningKeyLimitsAction(
	id: string,
	payload: ProvisioningKeyLimitPayload
) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	const { data: keyRow, error: keyErr } = await supabase
		.from("provisioning_keys")
		.select("team_id")
		.eq("id", id)
		.maybeSingle();
	if (keyErr) throw keyErr;
	if (!keyRow?.team_id) throw new Error("Management API key not found");
	await requireTeamMembership(supabase, user.id, keyRow.team_id, ["owner", "admin"]);

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
		.from("provisioning_keys")
		.update(updateObj)
		.eq("id", id)
		.eq("team_id", keyRow.team_id);

	if (error) {
		console.error("Failed to update management API key limits:", error);
		throw new Error(
			`Failed to update management API key limits: ${error.message}`
		);
	}

	revalidatePath("/settings/management-api-keys");

	return { success: true };
}

export async function deleteProvisioningKeyAction(
	id: string,
	confirmName?: string
) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	const { data: keyRow, error: keyErr } = await supabase
		.from("provisioning_keys")
		.select("team_id, name")
		.eq("id", id)
		.maybeSingle();
	if (keyErr) throw keyErr;
	if (!keyRow?.team_id) throw new Error("Management API key not found");
	await requireTeamMembership(supabase, user.id, keyRow.team_id, ["owner", "admin"]);

	// If confirmation is required, verify the name matches
	if (confirmName) {
		if (keyRow.name !== confirmName) {
			throw new Error(
				"Confirmation failed: Key name does not match"
			);
		}
	}

	const { error } = await supabase
		.from("provisioning_keys")
		.delete()
		.eq("id", id)
		.eq("team_id", keyRow.team_id);

	if (error) {
		console.error("Failed to delete management API key:", error);
		throw new Error(`Failed to delete management API key: ${error.message}`);
	}

	revalidatePath("/settings/management-api-keys");

	return { success: true };
}

export async function getProvisioningKeyById(id: string) {
	if (!id || typeof id !== "string") {
		throw new Error("Valid key ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();

	const { data, error } = await supabase
		.from("provisioning_keys")
		.select("*")
		.eq("id", id)
		.maybeSingle();
	if (data?.team_id) {
		await requireTeamMembership(supabase, user.id, data.team_id, ["owner", "admin"]);
	}

	if (error) {
		console.error("Failed to fetch management API key:", error);
		throw new Error(`Failed to fetch management API key: ${error.message}`);
	}

	return data;
}

export async function listProvisioningKeysByTeam(teamId: string) {
	if (!teamId || typeof teamId !== "string") {
		throw new Error("Valid team ID is required");
	}

	const { supabase, user } = await requireAuthenticatedUser();
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	const { data, error } = await supabase
		.from("provisioning_keys")
		.select("*")
		.eq("team_id", teamId)
		.order("created_at", { ascending: false });

	if (error) {
		console.error("Failed to list management API keys:", error);
		throw new Error(`Failed to list management API keys: ${error.message}`);
	}

	return data;
}
