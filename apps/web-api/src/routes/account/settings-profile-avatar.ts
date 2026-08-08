import { Hono } from "hono";

import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

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

function publicAvatarUrl(env: Env, key: string): string {
	const configuredBase = env.PROFILE_AVATARS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
	if (configuredBase) return `${configuredBase}/${key}`;
	return `/api/_web/profile-avatars/${key}`;
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

	const body = await c.req.arrayBuffer();
	if (!body.byteLength) return c.json({ error: "empty_profile_photo" }, 400, PRIVATE_NO_STORE_HEADERS);
	if (body.byteLength > MAX_AVATAR_BYTES) {
		return c.json({ error: "profile_photo_too_large" }, 413, PRIVATE_NO_STORE_HEADERS);
	}
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

	const avatarUrl = publicAvatarUrl(c.env, key);
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
