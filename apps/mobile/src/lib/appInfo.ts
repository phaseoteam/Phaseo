import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { APP_VERSION } from "./config";

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

/** The build: the source commit it came from (set by app.config.ts when the app was built). */
export const BUILD_COMMIT = extra?.buildCommit ?? null;
export const BUILT_AT = extra?.builtAt ?? null;

/** "0.1.0 (56dc9386b8)", or just the version for builds without a commit. */
export const VERSION_LABEL = BUILD_COMMIT ? `${APP_VERSION} (${BUILD_COMMIT})` : APP_VERSION;

/** "Google Pixel 8", "samsung SM-S911B": the maker once, then the model. */
export function deviceName() {
  const maker = Device.manufacturer ?? Device.brand ?? "";
  const model = Device.modelName ?? "Unknown device";
  return maker && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${model}` : model;
}

/** "Android 15 (API 35)". */
export function osName() {
  if (Platform.OS === "android") return `Android ${Device.osVersion ?? "?"} (API ${Platform.Version})`;
  return `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""}`.trim();
}

/** Plain lines about the app and the phone, for feedback and diagnostics. No account details. */
export function appSummaryLines() {
  return [`Phaseo for Android ${VERSION_LABEL}`, `Device: ${deviceName()}, ${osName()}`];
}
