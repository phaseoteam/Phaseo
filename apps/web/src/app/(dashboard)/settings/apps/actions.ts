"use server";

import { revalidatePath } from "next/cache";
import { revalidateAppDataTags } from "@/lib/cache/revalidateDataTags";
import { normalizeAppCategoryCsv } from "@/lib/appCategories";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

const PROTECTED_APP_TITLES = new Set([
	"phaseo chat",
	"phaseo playground",
	["ai", "stats", "chat"].join(" "),
	["ai", "stats", "playground"].join(" "),
]);
const PROTECTED_APP_KEY_PREFIXES = [
	"phaseo-chat",
	"phaseo-playground",
	"ai-stats-chat",
	"aistats-chat",
	"ai-stats-playground",
	"aistats-playground",
];

function isProtectedApp(title: string | null, appKey: string | null) {
	const normalizedTitle = title?.trim().toLowerCase();
	if (normalizedTitle && PROTECTED_APP_TITLES.has(normalizedTitle)) {
		return true;
	}
	const normalizedKey = appKey?.trim().toLowerCase();
	return Boolean(
		normalizedKey &&
			PROTECTED_APP_KEY_PREFIXES.some((prefix) =>
				normalizedKey.startsWith(prefix)
			)
	);
}

function normalizeOptionalHttpUrl(value: string | null | undefined, field: string) {
	if (value == null) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`${field} must be a valid URL`);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`${field} must start with http:// or https://`);
	}

	return parsed.toString();
}

type UpdateAppInput = {
	title?: string;
	url?: string | null;
	docs_url?: string | null;
	image_url?: string | null;
	is_public?: boolean;
	is_active?: boolean;
	category?: string | null;
};

export async function updateAppAction(appId: string, updates: UpdateAppInput) {
	if (!appId || typeof appId !== "string") {
		throw new Error("Valid app ID is required");
	}

	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");

	const updateObj: Record<string, unknown> = {};

	if (typeof updates.title === "string") {
		const trimmed = updates.title.trim();
		if (!trimmed) {
			throw new Error("Title cannot be empty");
		}
		updateObj.title = trimmed;
	}

	if (typeof updates.url === "string") {
		const trimmed = updates.url.trim();
		updateObj.url = trimmed.length > 0 ? trimmed : "about:blank";
	}

	if (updates.url === null) {
		updateObj.url = "about:blank";
	}

	if (typeof updates.docs_url === "string") {
		updateObj.docs_url = normalizeOptionalHttpUrl(
			updates.docs_url,
			"Docs URL"
		);
	}

	if (updates.docs_url === null) {
		updateObj.docs_url = null;
	}

	if (typeof updates.image_url === "string") {
		const trimmed = updates.image_url.trim();
		updateObj.image_url = trimmed.length > 0 ? trimmed : null;
	}

	if (updates.image_url === null) {
		updateObj.image_url = null;
	}

	if (typeof updates.is_public === "boolean") {
		updateObj.is_public = updates.is_public;
	}

	if (typeof updates.is_active === "boolean") {
		updateObj.is_active = updates.is_active;
	}

	if (Object.prototype.hasOwnProperty.call(updates, "category")) {
		updateObj.category = normalizeAppCategoryCsv(updates.category);
	}

	if (Object.keys(updateObj).length === 0) {
		return { success: true };
	}

	await fetchAccountWebApi(`/api/account/settings/apps/${encodeURIComponent(appId)}`, accessToken, { method: "PUT", body: JSON.stringify(updateObj) });

	revalidateAppDataTags([appId]);
	revalidatePath("/settings/apps");
	revalidatePath(`/apps/${appId}`);

	return { success: true };
}

export async function mergeAppsAction(
	sourceAppId: string,
	targetAppId: string
) {
	if (!sourceAppId || !targetAppId) {
		throw new Error("Source and target apps are required");
	}
	if (sourceAppId === targetAppId) {
		throw new Error("Select a different target app");
	}

	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	await fetchAccountWebApi(`/api/account/settings/apps/${encodeURIComponent(sourceAppId)}/merge`, accessToken, { method: "POST", body: JSON.stringify({ targetAppId }) });

	revalidateAppDataTags([sourceAppId, targetAppId]);
	revalidatePath("/settings/apps");
	revalidatePath(`/apps/${sourceAppId}`);
	revalidatePath(`/apps/${targetAppId}`);

	return { success: true };
}
