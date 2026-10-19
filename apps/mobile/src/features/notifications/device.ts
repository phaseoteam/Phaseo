import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Linking, Platform } from "react-native";
import { registerDevice, type NotificationSettings } from "@/lib/api/notifications";
import { APP_VERSION } from "@/lib/config";
import { kv } from "@/lib/storage";
import { channelInput, createChannels, LEGACY_CHANNEL, type ChannelApi, type ChannelImportance } from "./channels";
import { registerPhone, registrationKey, syncRegistration, type PhoneDevice, type RegisterDeps } from "./registration";

const INSTALLATION_KEY = "phaseo.notification-installation";
const REGISTRATION_KEY = "phaseo.push-registration";

/** A stable ID for this install, so the server can replace this device's push token rather than add another. */
export async function installationId(): Promise<string> {
  const existing = await kv.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = `install:${Crypto.randomUUID()}`;
  await kv.setItem(INSTALLATION_KEY, created);
  return created;
}

const IMPORTANCE: Record<ChannelImportance, AndroidImportance> = { low: AndroidImportance.LOW, default: AndroidImportance.DEFAULT, high: AndroidImportance.HIGH };

const androidChannels: ChannelApi = {
  set: (id, { importance, ...channel }) => Notifications.setNotificationChannelAsync(id, { ...channel, importance: IMPORTANCE[importance] }),
  remove: (id) => Notifications.deleteNotificationChannelAsync(id),
};

/** Creates the scheme-2 channels (Android only). Runs on every start and before asking for permission. */
export async function ensurePushChannels() {
  if (Platform.OS === "android") await createChannels(androidChannels);
}

const registerDeps: RegisterDeps = {
  register: registerDevice,
  keepLegacyChannel: async () => { if (Platform.OS === "android") await androidChannels.set(LEGACY_CHANNEL.id, channelInput(LEGACY_CHANNEL)); },
  removeLegacyChannel: async () => { if (Platform.OS === "android") await androidChannels.remove(LEGACY_CHANNEL.id); },
};

export async function permissionStatus() {
  return (await Notifications.getPermissionsAsync()).status;
}

/** This phone's Expo push token and details. Needs notification permission. */
async function pushDevice(): Promise<PhoneDevice> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || !projectId) throw new Error("This build isn't linked to an Expo project, so it can't receive notifications yet.");
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return {
    installationId: await installationId(),
    expoPushToken,
    platform: Platform.OS === "ios" ? "ios" : "android",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceName: Device.deviceName ?? Device.modelName ?? null,
    appVersion: APP_VERSION,
  };
}

/** Asks for permission (once) and returns this phone's push details. */
export async function registerForPush(): Promise<PhoneDevice> {
  if (!Device.isDevice) throw new Error("Notifications need a real phone, not an emulator.");
  if (Platform.OS !== "android" && Platform.OS !== "ios") throw new Error("Notifications work on Android and iOS.");
  // Android 13 only shows the permission prompt once the app has a channel.
  await ensurePushChannels();
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notifications are turned off for Phaseo in your phone's settings.");
  return pushDevice();
}

/** Registers this phone after the user turns notifications on. `schemeTwo`: the server returned categories. */
export async function registerThisPhone(userId: string, device: PhoneDevice, schemeTwo: boolean) {
  const scheme = await registerPhone(device, schemeTwo, registerDeps);
  await kv.setItem(REGISTRATION_KEY, registrationKey(userId, device, scheme));
}

/** On start: re-registers this phone if its notifications are on and anything changed (see syncRegistration). */
export function syncThisPhone(userId: string, settings: () => Promise<NotificationSettings>) {
  return syncRegistration(userId, {
    ...registerDeps,
    permissionGranted: async () => Device.isDevice && (Platform.OS === "android" || Platform.OS === "ios") && (await permissionStatus()) === "granted",
    settings,
    device: pushDevice,
    lastKey: () => kv.getItem(REGISTRATION_KEY),
    saveKey: (key) => kv.setItem(REGISTRATION_KEY, key),
  });
}

/** After sign-out, so the next account to turn notifications on registers afresh. */
export async function forgetRegistration() {
  await kv.removeItem(REGISTRATION_KEY);
}

/** Channels the user has switched off in Android's own settings. */
export async function blockedChannels(): Promise<Set<string>> {
  if (Platform.OS !== "android") return new Set();
  const channels = await Notifications.getNotificationChannelsAsync();
  return new Set(channels.filter((channel) => channel.importance === AndroidImportance.NONE).map((channel) => channel.id));
}

/**
 * Opens Android's settings for one channel (sound, pop-up, on or off). Falls back to the app's
 * notification settings, then its app info page, if a phone's Settings app doesn't take the intent.
 */
export async function openChannelSettings(channelId: string) {
  const packageName = Constants.expoConfig?.android?.package;
  if (packageName) {
    const app = { key: "android.provider.extra.APP_PACKAGE", value: packageName };
    try {
      await Linking.sendIntent("android.settings.CHANNEL_NOTIFICATION_SETTINGS", [app, { key: "android.provider.extra.CHANNEL_ID", value: channelId }]);
      return;
    } catch { /* try the app's notification settings */ }
    try {
      await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [app]);
      return;
    } catch { /* fall through to app info */ }
  }
  await Linking.openSettings();
}
