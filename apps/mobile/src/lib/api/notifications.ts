import { z } from "zod";
import { request } from "./http";

export const EVENT_KINDS = ["model_released", "gateway_available", "price_changed", "deprecation_announced", "provider_added", "provider_launched"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** What servers knew before push v2 added provider_launched. Servers list their own in `eventKinds`. */
export const LEGACY_EVENT_KINDS: readonly EventKind[] = ["model_released", "gateway_available", "price_changed", "deprecation_announced", "provider_added"];
export type ScopeMode = "all" | "only" | "except";

const scopeSchema = z.object({ mode: z.enum(["all", "only", "except"]), ids: z.array(z.string()).default([]) });

const ruleSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  enabled: z.boolean(),
  action: z.enum(["notify", "mute"]),
  // Kept as sent, so a kind this build doesn't know survives an edit (the server rejects kinds it doesn't know).
  events: z.array(z.string()),
  labs: scopeSchema,
  providers: scopeSchema,
  models: z.array(z.string()).default([]),
  inputModalities: z.array(z.string()).default([]),
  outputModalities: z.array(z.string()).default([]),
  onlyOnPhaseo: z.boolean().default(false),
  includeFreeVariants: z.boolean().default(false),
  position: z.coerce.number().default(0),
});

export type NotificationRule = z.infer<typeof ruleSchema>;
export type RuleInput = Omit<NotificationRule, "id" | "position">;

const settingsSchema = z.object({
  enabled: z.boolean(),
  quietHours: z.object({ start: z.string(), end: z.string() }).nullish(),
  dailyCap: z.coerce.number().default(10),
  deviceRegistered: z.boolean().default(false),
  rules: z.array(ruleSchema).default([]),
  // Came with push v2. Without it the app offers only the kinds every server knows.
  eventKinds: z.array(z.string()).nullish(),
});

export type NotificationSettings = z.infer<typeof settingsSchema>;

const base = "/api/account/settings/mobile-notifications";

export async function getNotificationSettings(installationId: string): Promise<NotificationSettings> {
  return settingsSchema.parse(await request(base, { auth: true, query: { installationId } }));
}

/** Pass this install's ID so the response says whether this phone is registered. */
export async function updateNotificationSettings(installationId: string, patch: { enabled?: boolean; quietHours?: { start: string; end: string } | null; dailyCap?: number }): Promise<NotificationSettings> {
  return settingsSchema.parse(await request(base, { method: "PUT", auth: true, query: { installationId }, body: patch }));
}

export async function registerDevice(device: { installationId: string; expoPushToken: string; platform: "android" | "ios"; timeZone: string; deviceName: string | null; appVersion: string }) {
  const { installationId, ...body } = device;
  await request(`${base}/devices/${encodeURIComponent(installationId)}`, { method: "PUT", auth: true, body });
}

export async function unregisterDevice(installationId: string) {
  await request(`${base}/devices/${encodeURIComponent(installationId)}`, { method: "DELETE", auth: true });
}

export async function createRule(input: RuleInput): Promise<NotificationRule> {
  const raw = await request<{ rule: unknown }>(`${base}/rules`, { method: "POST", auth: true, body: input });
  return ruleSchema.parse(raw.rule);
}

export async function updateRule(id: string, patch: Partial<RuleInput>): Promise<NotificationRule> {
  const raw = await request<{ rule: unknown }>(`${base}/rules/${encodeURIComponent(id)}`, { method: "PATCH", auth: true, body: patch });
  return ruleSchema.parse(raw.rule);
}

export async function deleteRule(id: string) {
  await request(`${base}/rules/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function sendTestNotification(installationId: string) {
  await request(`${base}/test`, { method: "POST", auth: true, body: { installationId } });
}
