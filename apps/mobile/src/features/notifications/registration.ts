/**
 * Registering this phone for push, and moving it to channel scheme 2 (see channels.ts). The rules are
 * here with their dependencies passed in, so they can be tested; device.ts supplies the real ones.
 */

export type ChannelScheme = 1 | 2;

export type PhoneDevice = { installationId: string; expoPushToken: string; platform: "android" | "ios"; timeZone: string; deviceName: string | null; appVersion: string };

export type RegisterDeps = {
  register(device: PhoneDevice & { channelScheme?: 2 }): Promise<void>;
  /** Creates the scheme-1 channel, which an old server sends everything to. */
  keepLegacyChannel(): Promise<void>;
  removeLegacyChannel(): Promise<void>;
};

export type SyncDeps = RegisterDeps & {
  /** False without notification permission, or off a real phone; never asks. */
  permissionGranted(): Promise<boolean>;
  settings(): Promise<{ enabled: boolean; deviceRegistered: boolean; categories?: unknown }>;
  device(): Promise<PhoneDevice>;
  lastKey(): Promise<string | null>;
  saveKey(key: string): Promise<void>;
};

/** Servers before push v2 reject fields they don't know: 400, "Unknown field: channelScheme." */
export function rejectedField(error: unknown, field: string) {
  return error instanceof Error && (error as { status?: unknown }).status === 400 && error.message.includes(field);
}

/**
 * The scheme to ask for. Categories and channel scheme 2 ship together in push v2, so a server that
 * returns `categories` accepts `channelScheme`; an older one would reject the whole registration.
 */
export function serverScheme(settings: { categories?: unknown }): ChannelScheme {
  return settings.categories ? 2 : 1;
}

/** What the server last accepted from this phone, so a start with nothing changed sends nothing. */
export function registrationKey(userId: string, device: PhoneDevice, scheme: ChannelScheme) {
  return JSON.stringify([userId, device.installationId, device.expoPushToken, device.platform, device.timeZone, device.deviceName, device.appVersion, scheme]);
}

/**
 * Registers the phone, with scheme 2 when the server supports it. The old channel is deleted only once
 * a server has accepted scheme 2; if it rejects the field after all, the phone registers as before.
 */
export async function registerPhone(device: PhoneDevice, schemeTwo: boolean, deps: RegisterDeps): Promise<ChannelScheme> {
  if (schemeTwo) {
    try {
      await deps.register({ ...device, channelScheme: 2 });
      await deps.removeLegacyChannel();
      return 2;
    } catch (error) {
      if (!rejectedField(error, "channelScheme")) throw error;
    }
  }
  await deps.keepLegacyChannel();
  await deps.register(device);
  return 1;
}

/**
 * On start: re-registers a phone that already has notifications on, when anything in its registration
 * changed (token, time zone, app version, account) or the server now speaks scheme 2. That moves
 * existing installs to the new channels without the user doing anything. It never turns notifications
 * on by itself: a phone that isn't registered stays that way.
 */
export async function syncRegistration(userId: string, deps: SyncDeps): Promise<"skipped" | "unchanged" | ChannelScheme> {
  if (!(await deps.permissionGranted())) return "skipped";
  const settings = await deps.settings();
  if (!settings.enabled || !settings.deviceRegistered) return "skipped";
  const device = await deps.device();
  const wanted = serverScheme(settings);
  if (registrationKey(userId, device, wanted) === (await deps.lastKey())) return "unchanged";
  const scheme = await registerPhone(device, wanted === 2, deps);
  // Saved as registered: a fallback to scheme 1 tries scheme 2 again next start.
  await deps.saveKey(registrationKey(userId, device, scheme));
  return scheme;
}
