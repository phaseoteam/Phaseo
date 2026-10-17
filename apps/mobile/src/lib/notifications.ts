import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const installationKey = "phaseo.notification-installation";

export async function getNotificationInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(installationKey);
  if (existing) return existing;
  const created = `install:${Crypto.randomUUID()}`;
  await AsyncStorage.setItem(installationKey, created);
  return created;
}

export function notificationModelId(response: Notifications.NotificationResponse): string | null {
  const value = response.notification.request.content.data?.modelId;
  return typeof value === "string" && value.trim() ? value : null;
}

export async function registerForModelReleaseNotifications(): Promise<{ installationId: string; expoPushToken: string; platform: "android" | "ios" }> {
  if (!Device.isDevice) throw new Error("Push notifications require a physical device.");
  if (Platform.OS !== "android" && Platform.OS !== "ios") throw new Error("Push notifications are available on Android and iOS.");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("model-releases", {
      name: "New Model Releases",
      description: "New AI model release information from Phaseo.",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#2563eb",
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notification permission was not granted.");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || !projectId) throw new Error("This build is not linked to an Expo project for push notifications yet.");
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return { installationId: await getNotificationInstallationId(), expoPushToken, platform: Platform.OS };
}
