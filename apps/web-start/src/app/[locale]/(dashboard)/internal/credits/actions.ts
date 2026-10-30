"use server";

import { revalidatePath } from "next/cache";
import {
	isPromoCodeFormatValid,
	normalizePromoCodeInput,
} from "@/lib/credits/promoCodes";
import { parseOptionalExpiryInput } from "@/lib/credits/expiryDateTime";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

async function requireAdmin() {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	return accessToken;
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
	const accessToken = await requireAdmin();

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

	const payload = {
		code,
		amount_nanos: amountNanos,
		max_redemptions: maxRedemptions,
		expires_at: expiresAt,
		note,
	};
	await fetchAccountWebApi("/api/account/credits/admin/grants", accessToken, { method: "POST", body: JSON.stringify(payload) });

	revalidatePath("/internal/credits");
}

export async function disableCreditGrantAction(formData: FormData) {
	const accessToken = await requireAdmin();
	const grantId = String(formData.get("grant_id") ?? "").trim();
	if (!grantId) throw new Error("Missing grant id");

	await fetchAccountWebApi(`/api/account/credits/admin/grants/${encodeURIComponent(grantId)}/disable`, accessToken, { method: "POST" });

	revalidatePath("/internal/credits");
}

export async function deleteCreditGrantAction(formData: FormData) {
	const accessToken = await requireAdmin();
	const grantId = String(formData.get("grant_id") ?? "").trim();
	if (!grantId) throw new Error("Missing grant id");

	await fetchAccountWebApi(`/api/account/credits/admin/grants/${encodeURIComponent(grantId)}`, accessToken, { method: "DELETE" });

	revalidatePath("/internal/credits");
}

export async function updateCreditGrantAction(formData: FormData) {
	const accessToken = await requireAdmin();
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

	await fetchAccountWebApi(`/api/account/credits/admin/grants/${encodeURIComponent(grantId)}`, accessToken, { method: "PUT", body: JSON.stringify({ max_redemptions: maxRedemptions, redemptions_count: redemptionsCount, expires_at: expiresAt, note, is_active: isActive }) });

	revalidatePath("/internal/credits");
}
