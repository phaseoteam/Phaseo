import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { APP_VERSION } from "./config";
import { hapticsHere } from "./haptics";

const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/** The build: the source commit it came from (set by app.config.ts when the app was built). */
export const BUILD_COMMIT = text(extra?.buildCommit);
export const BUILT_AT = text(extra?.builtAt);
/** The build number, which is also the Android versionCode: the number of commits up to the build's commit. */
export const BUILD_NUMBER = typeof extra?.buildNumber === "number" && Number.isInteger(extra.buildNumber) ? extra.buildNumber : null;

/**
 * "0.1.0 (build 2496)"; with `commit`, "0.1.0 (build 2496, 56dc9386b8)". Builds from before build numbers show
 * their commit, and builds without either just the version.
 */
export function versionLabel(version: string, build: { number: number | null; commit: string | null }, { commit = false } = {}) {
  const parts = build.number != null ? [`build ${build.number}`, commit ? build.commit : null] : [build.commit];
  const detail = parts.filter(Boolean).join(", ");
  return detail ? `${version} (${detail})` : version;
}

/** For Account → Version and build. */
export const VERSION_LABEL = versionLabel(APP_VERSION, { number: BUILD_NUMBER, commit: BUILD_COMMIT });
/** For copying and feedback, where the exact commit helps. */
export const FULL_VERSION_LABEL = versionLabel(APP_VERSION, { number: BUILD_NUMBER, commit: BUILD_COMMIT }, { commit: true });

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
  return [`Phaseo for Android ${FULL_VERSION_LABEL}`, `Device: ${deviceName()}, ${osName()}`, `Haptics: ${hapticsHere()}`];
}
