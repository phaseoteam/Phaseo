import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";
import { kv } from "@/lib/storage";

const INSTALLATION_KEY = "phaseo.notification-installation";
export const CHANNEL_ID = "model-updates";

/** A stable ID for this install, so the server can replace this device's push token rather than add another. */
export async function installationId(): Promise<string> {
  const existing = await kv.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = `install:${Crypto.randomUUID()}`;
  await kv.setItem(INSTALLATION_KEY, created);
  return created;
}

export type PushRegistration = { installationId: string; expoPushToken: string; platform: "android" | "ios"; timeZone: string; deviceName: string | null };

export async function permissionStatus() {
  return (await Notifications.getPermissionsAsync()).status;
}

/** Asks for permission (once) and returns this device's Expo push token. */
export async function registerForPush(): Promise<PushRegistration> {
  if (!Device.isDevice) throw new Error("Notifications need a real phone, not an emulator.");
  if (Platform.OS !== "android" && Platform.OS !== "ios") throw new Error("Notifications work on Android and iOS.");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Model updates",
      description: "New models, availability on Phaseo, price changes and deprecations that match your rules.",
      importance: AndroidImportance.DEFAULT,
      lightColor: "#2563eb",
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notifications are turned off for Phaseo in your phone's settings.");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || !projectId) throw new Error("This build isn't linked to an Expo project, so it can't receive notifications yet.");
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return {
    installationId: await installationId(),
    expoPushToken,
    platform: Platform.OS,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceName: Device.deviceName ?? Device.modelName ?? null,
  };
}
