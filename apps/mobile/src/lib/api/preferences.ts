import { z } from "zod";
import { normalizeTheme, type ThemeFields } from "@/lib/theme/model";
import { mergeThemeIntoPreferences } from "@/lib/theme/sync";
import { request } from "./http";

/** The website's display preferences route (web-api accountSettingsRouter, /preferences). */
const PATH = "/api/account/settings/preferences";

const preferencesSchema = z.object({
  signedIn: z.boolean().default(true),
  preferences: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

export type AccountPreferences = { signedIn: boolean; preferences: Record<string, unknown>; theme: ThemeFields };

/** The account's display preferences, including the four theme fields the website saves. */
export async function getAccountPreferences(signal?: AbortSignal): Promise<AccountPreferences> {
  const parsed = preferencesSchema.parse(await request(PATH, { auth: true, signal }));
  return { signedIn: parsed.signedIn, preferences: parsed.preferences, theme: normalizeTheme(parsed.preferences) };
}

/**
 * Saves the theme on the account. The route replaces every display preference at once, so the other
 * preferences (locale, time zone and so on) are sent back as the account has them.
 */
export async function saveAccountTheme(current: Record<string, unknown>, theme: ThemeFields): Promise<ThemeFields> {
  const raw = await request(PATH, { method: "PUT", auth: true, body: mergeThemeIntoPreferences(current, theme) });
  const parsed = z.object({ preferences: z.record(z.string(), z.unknown()).default({}) }).passthrough().parse(raw);
  return normalizeTheme(parsed.preferences);
}
