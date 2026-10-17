import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const INSTALLATION_ID = /^[A-Za-z0-9._:-]{8,200}$/;

export function validExpoPushToken(value: unknown): value is string {
	return typeof value === "string" && EXPO_PUSH_TOKEN.test(value);
}

export function validInstallationId(value: unknown): value is string {
	return typeof value === "string" && INSTALLATION_ID.test(value);
}

export const accountSettingsMobileNotificationsRouter = new Hono<{ Bindings: Env }>();

accountSettingsMobileNotificationsRouter.get("/mobile-notifications", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const installationId = c.req.query("installationId")?.trim();
	const client = getDataClient(c.env);
	const [preference, device] = await Promise.all([
		client.from("mobile_notification_preferences").select("new_model_releases_enabled").eq("user_id", user.id).maybeSingle(),
		installationId && validInstallationId(installationId)
			? client.from("mobile_push_devices").select("status,last_seen_at").eq("user_id", user.id).eq("installation_id", installationId).maybeSingle()
			: Promise.resolve({ data: null, error: null }),
	]);
	if (preference.error || device.error) return c.json({ error: "mobile_notification_settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		newModelReleases: Boolean(preference.data?.new_model_releases_enabled),
		deviceRegistered: device.data?.status === "active",
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.put("/mobile-notifications", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json().catch(() => null) as { newModelReleases?: unknown } | null;
	if (typeof body?.newModelReleases !== "boolean") return c.json({ error: "invalid_preferences" }, 400, PRIVATE_NO_STORE_HEADERS);
	const now = new Date().toISOString();
	const result = await getDataClient(c.env).from("mobile_notification_preferences").upsert({
		user_id: user.id,
		new_model_releases_enabled: body.newModelReleases,
		updated_at: now,
	}, { onConflict: "user_id" });
	if (result.error) return c.json({ error: "mobile_notification_preferences_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ newModelReleases: body.newModelReleases }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.post("/mobile-notifications/devices", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json().catch(() => null) as { installationId?: unknown; expoPushToken?: unknown; platform?: unknown } | null;
	if (!validInstallationId(body?.installationId) || !validExpoPushToken(body?.expoPushToken) || !["android", "ios"].includes(String(body?.platform))) {
		return c.json({ error: "invalid_device" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	const client = getDataClient(c.env);
	const now = new Date().toISOString();
	const removed = await client.from("mobile_push_devices").delete().eq("user_id", user.id).eq("installation_id", body.installationId).neq("expo_push_token", body.expoPushToken);
	if (removed.error) return c.json({ error: "mobile_notification_device_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("mobile_push_devices").upsert({
		user_id: user.id,
		installation_id: body.installationId,
		expo_push_token: body.expoPushToken,
		platform: body.platform,
		status: "active",
		last_seen_at: now,
		updated_at: now,
		invalidated_at: null,
	}, { onConflict: "expo_push_token" });
	if (result.error) return c.json({ error: "mobile_notification_device_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ registered: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.delete("/mobile-notifications/devices/:installationId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const installationId = c.req.param("installationId");
	if (!validInstallationId(installationId)) return c.json({ error: "invalid_device" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await getDataClient(c.env).from("mobile_push_devices").update({ status: "disabled", updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("installation_id", installationId);
	if (result.error) return c.json({ error: "mobile_notification_device_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ registered: false }, 200, PRIVATE_NO_STORE_HEADERS);
});
