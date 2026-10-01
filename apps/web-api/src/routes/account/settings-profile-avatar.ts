import { Hono } from "hono";

import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

type AvatarFormat = {
	contentType: "image/jpeg" | "image/png" | "image/webp";
	extension: "jpg" | "png" | "webp";
};

function detectAvatarFormat(bytes: Uint8Array): AvatarFormat | null {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return { contentType: "image/jpeg", extension: "jpg" };
	}
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return { contentType: "image/png", extension: "png" };
	}
	if (
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
	) {
		return { contentType: "image/webp", extension: "webp" };
	}
	return null;
}

async function readRequestBodyWithLimit(
	body: ReadableStream<Uint8Array> | null,
	maxBytes: number,
): Promise<ArrayBuffer | null> {
	if (!body) return new ArrayBuffer(0);

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				await reader.cancel("request_body_too_large");
				return null;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const output = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output.buffer;
}

function isLocalAvatarRequest(request: Request): boolean {
	const originalHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host)
		.split(":", 1)[0]
		.toLowerCase();
	return new URL(request.url).protocol === "http:" || originalHost === "localhost" || originalHost === "127.0.0.1" || originalHost === "::1";
}

function publicAvatarUrl(env: Env, request: Request, key: string): string {
	if (isLocalAvatarRequest(request)) {
		return `/api/_web/profile-avatars/${key}`;
	}
	const configuredBase = env.PROFILE_AVATARS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
	if (configuredBase) return `${configuredBase}/${key}`;
	return `/api/_web/profile-avatars/${key}`;
}

export function requestAwareAvatarUrl(env: Env, request: Request, storedUrl: unknown): string | null {
	if (typeof storedUrl !== "string" || !storedUrl.trim()) return null;
	const value = storedUrl.trim();
	if (!isLocalAvatarRequest(request)) return value;
	const configuredBase = env.PROFILE_AVATARS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
	if (!configuredBase || !value.startsWith(`${configuredBase}/`)) return value;
	return `/api/_web/profile-avatars/${value.slice(configuredBase.length + 1)}`;
}

export function ownedProfileAvatarKey(env: Env, request: Request, avatarUrl: unknown, userId: string): string | null {
	if (typeof avatarUrl !== "string" || !avatarUrl.trim()) return null;
	try {
		const parsed = new URL(avatarUrl, new URL(request.url).origin);
		const configuredBase = env.PROFILE_AVATARS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
		let key: string | null = null;
		if (configuredBase) {
			const base = new URL(configuredBase);
			if (parsed.origin === base.origin) key = parsed.pathname.replace(/^\/+/, "");
		}
		const workerPrefix = "/api/_web/profile-avatars/";
		if (!key && parsed.origin === new URL(request.url).origin && parsed.pathname.startsWith(workerPrefix)) {
			key = parsed.pathname.slice(workerPrefix.length);
		}
		return key?.startsWith(`avatars/${userId}/`) && !key.includes("..") ? key : null;
	} catch {
		return null;
	}
}

function ownedWorkspaceLogoKey(env: Env, request: Request, logoUrl: unknown, workspaceId: string): string | null {
	if (typeof logoUrl !== "string" || !logoUrl.trim()) return null;
	try {
		const parsed = new URL(logoUrl, new URL(request.url).origin);
		const configuredBase = env.PROFILE_AVATARS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
		let key: string | null = null;
		if (configuredBase && parsed.origin === new URL(configuredBase).origin) key = parsed.pathname.replace(/^\/+/, "");
		const workerPrefix = "/api/_web/profile-avatars/";
		if (!key && parsed.origin === new URL(request.url).origin && parsed.pathname.startsWith(workerPrefix)) key = parsed.pathname.slice(workerPrefix.length);
		return key?.startsWith(`workspaces/${workspaceId}/`) && !key.includes("..") ? key : null;
	} catch { return null; }
}

async function validatedImageBody(request: Request) {
	const declaredLength = Number(request.headers.get("content-length") ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_AVATAR_BYTES) return { error: "workspace_logo_too_large", status: 413 as const };
	const declaredType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
	if (!declaredType || !["image/jpeg", "image/png", "image/webp"].includes(declaredType)) return { error: "unsupported_workspace_logo", status: 415 as const };
	const body = await readRequestBodyWithLimit(request.body, MAX_AVATAR_BYTES);
	if (body === null) return { error: "workspace_logo_too_large", status: 413 as const };
	if (!body.byteLength) return { error: "empty_workspace_logo", status: 400 as const };
	const format = detectAvatarFormat(new Uint8Array(body));
	if (!format || format.contentType !== declaredType) return { error: "invalid_workspace_logo", status: 400 as const };
	return { body, format };
}

export const accountSettingsProfileAvatarRouter = new Hono<{ Bindings: Env }>();

accountSettingsProfileAvatarRouter.post("/profile/avatar", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);

	const bucket = c.env.PROFILE_AVATARS_BUCKET;
	if (!bucket) return c.json({ error: "profile_avatar_storage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);

	const declaredLength = Number(c.req.header("content-length") ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_AVATAR_BYTES) {
		return c.json({ error: "profile_photo_too_large" }, 413, PRIVATE_NO_STORE_HEADERS);
	}

	const declaredType = c.req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
	if (!declaredType || !["image/jpeg", "image/png", "image/webp"].includes(declaredType)) {
		return c.json({ error: "unsupported_profile_photo" }, 415, PRIVATE_NO_STORE_HEADERS);
	}

	const body = await readRequestBodyWithLimit(c.req.raw.body, MAX_AVATAR_BYTES);
	if (body === null) {
		return c.json({ error: "profile_photo_too_large" }, 413, PRIVATE_NO_STORE_HEADERS);
	}
	if (!body.byteLength) return c.json({ error: "empty_profile_photo" }, 400, PRIVATE_NO_STORE_HEADERS);
	const format = detectAvatarFormat(new Uint8Array(body));
	if (!format || format.contentType !== declaredType) {
		return c.json({ error: "invalid_profile_photo" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	const key = `avatars/${user.id}/${crypto.randomUUID()}.${format.extension}`;
	const stored = await bucket.put(key, body, {
		httpMetadata: {
			contentType: format.contentType,
			cacheControl: AVATAR_CACHE_CONTROL,
		},
		customMetadata: { ownerUserId: user.id },
	});
	if (!stored) return c.json({ error: "profile_avatar_storage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);

	const avatarUrl = publicAvatarUrl(c.env, c.req.raw, key);
	const previousKey = ownedProfileAvatarKey(c.env, c.req.raw, user.userMetadata.avatar_url, user.id);
	const { error } = await getDataClient(c.env).auth.admin.updateUserById(user.id, {
		user_metadata: { ...user.userMetadata, avatar_url: avatarUrl },
	});
	if (error) {
		await bucket.delete(key).catch(() => undefined);
		return c.json({ error: "profile_avatar_update_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	if (previousKey && previousKey !== key) await bucket.delete(previousKey).catch(() => undefined);

	return c.json({ avatarUrl }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileAvatarRouter.post("/teams/:workspaceId/logo", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.param("workspaceId") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const bucket = c.env.PROFILE_AVATARS_BUCKET;
	if (!bucket) return c.json({ error: "workspace_logo_storage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const image = await validatedImageBody(c.req.raw);
	if ("error" in image) return c.json({ error: image.error }, image.status, PRIVATE_NO_STORE_HEADERS);
	const key = `workspaces/${context.workspaceId}/${crypto.randomUUID()}.${image.format.extension}`;
	const stored = await bucket.put(key, image.body, { httpMetadata: { contentType: image.format.contentType, cacheControl: AVATAR_CACHE_CONTROL }, customMetadata: { workspaceId: context.workspaceId } });
	if (!stored) return c.json({ error: "workspace_logo_storage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const logoUrl = publicAvatarUrl(c.env, c.req.raw, key);
	const previousKey = ownedWorkspaceLogoKey(c.env, c.req.raw, context.workspaceLogoUrl, context.workspaceId);
	const result = await context.client.from("workspaces").update({ logo_url: logoUrl }).eq("id", context.workspaceId);
	if (result.error) { await bucket.delete(key).catch(() => undefined); return c.json({ error: "workspace_logo_update_failed" }, 503, PRIVATE_NO_STORE_HEADERS); }
	if (previousKey && previousKey !== key) await bucket.delete(previousKey).catch(() => undefined);
	return c.json({ logoUrl }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileAvatarRouter.delete("/teams/:workspaceId/logo", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.param("workspaceId") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const previousKey = ownedWorkspaceLogoKey(c.env, c.req.raw, context.workspaceLogoUrl, context.workspaceId);
	const result = await context.client.from("workspaces").update({ logo_url: null }).eq("id", context.workspaceId);
	if (result.error) return c.json({ error: "workspace_logo_update_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (previousKey && c.env.PROFILE_AVATARS_BUCKET) await c.env.PROFILE_AVATARS_BUCKET.delete(previousKey).catch(() => undefined);
	return c.json({ logoUrl: null }, 200, PRIVATE_NO_STORE_HEADERS);
});
