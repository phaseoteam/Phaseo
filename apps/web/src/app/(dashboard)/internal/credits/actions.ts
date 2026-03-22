"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
	isPromoCodeFormatValid,
	normalizePromoCodeInput,
} from "@/lib/credits/promoCodes";
import { parseOptionalExpiryInput } from "@/lib/credits/expiryDateTime";

async function requireAdmin() {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw new Error("Unauthorized");

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();
	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		throw new Error("Unauthorized");
	}

	return { supabase, userId: user.id };
}

function parsePositiveInt(raw: FormDataEntryValue | null, fallback: number): number {
	if (typeof raw !== "string") return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function parsePositiveUsdToNanos(raw: FormDataEntryValue | null): number {
	if (typeof raw !== "string") throw new Error("Amount is required");
	const usd = Number(raw);
	if (!Number.isFinite(usd) || usd <= 0) {
		throw new Error("Amount must be greater than 0");
	}
	return Math.round(usd * 1_000_000_000);
}

function parseNonNegativeInt(raw: FormDataEntryValue | null, fallback: number): number {
	if (typeof raw !== "string") return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return parsed;
}

export async function createCreditGrantAction(formData: FormData) {
	const { supabase, userId } = await requireAdmin();

	const codeRaw = String(formData.get("code") ?? "");
	const code = normalizePromoCodeInput(codeRaw);
	if (!isPromoCodeFormatValid(code)) {
		throw new Error("Code must use A-Z, 0-9, _ or -, and be at least 2 chars.");
	}

	const amountNanos = parsePositiveUsdToNanos(formData.get("amount_usd"));
	const maxRedemptions = parsePositiveInt(formData.get("max_redemptions"), 1);
	const expiresAt = parseOptionalExpiryInput(formData.get("expires_at"));
	const noteRaw = String(formData.get("note") ?? "").trim();
	const note = noteRaw.length > 0 ? noteRaw : null;

	const { error } = await supabase.from("credit_grants").insert({
		code,
		code_normalized: code,
		amount_nanos: amountNanos,
		max_redemptions: maxRedemptions,
		expires_at: expiresAt,
		is_active: true,
		created_by: userId,
		note,
	});
	if (error) throw error;

	revalidatePath("/internal/credits");
}

export async function disableCreditGrantAction(formData: FormData) {
	const { supabase } = await requireAdmin();
	const grantId = String(formData.get("grant_id") ?? "").trim();
	if (!grantId) throw new Error("Missing grant id");

	const { error } = await supabase
		.from("credit_grants")
		.update({
			is_active: false,
			disabled_at: new Date().toISOString(),
		})
		.eq("id", grantId);
	if (error) throw error;

	revalidatePath("/internal/credits");
}

export async function updateCreditGrantAction(formData: FormData) {
	const { supabase } = await requireAdmin();
	const grantId = String(formData.get("grant_id") ?? "").trim();
	if (!grantId) throw new Error("Missing grant id");

	const maxRedemptions = parsePositiveInt(formData.get("max_redemptions"), 1);
	const rawRedemptionsCount = parseNonNegativeInt(formData.get("redemptions_count"), 0);
	const redemptionsCount = Math.min(rawRedemptionsCount, maxRedemptions);
	const expiresAt = parseOptionalExpiryInput(formData.get("expires_at"));
	const noteRaw = String(formData.get("note") ?? "").trim();
	const note = noteRaw.length > 0 ? noteRaw : null;
	const isActive = formData
		.getAll("is_active")
		.some((value) => String(value).toLowerCase() === "true");

	const nowIso = new Date().toISOString();
	const { error } = await supabase
		.from("credit_grants")
		.update({
			max_redemptions: maxRedemptions,
			redemptions_count: redemptionsCount,
			expires_at: expiresAt,
			note,
			is_active: isActive,
			disabled_at: isActive ? null : nowIso,
		})
		.eq("id", grantId);
	if (error) throw error;

	revalidatePath("/internal/credits");
}
