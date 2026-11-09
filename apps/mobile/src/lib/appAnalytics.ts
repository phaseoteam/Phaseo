import { createAppBudget, filterAppEvent, privateException, type AppAnalyticsEvent, type AppErrorSource } from "@phaseo/app-kit/app-analytics";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { PostHog } from "posthog-react-native";
import { APP_VERSION } from "./config";
import { kv } from "./storage";
import { createStore } from "./store";

const preference = "phaseo.analytics.enabled";
const extra = Constants.expoConfig?.extra;
const key = process.env.EXPO_PUBLIC_POSTHOG_KEY || extra?.posthogKey;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || extra?.posthogHost || "https://eu.i.posthog.com";
const available = !__DEV__ && process.env.EXPO_PUBLIC_PERF_TOOLS !== "1" && Boolean(key) && /^https:\/\/(?:eu|us)\.i\.posthog\.com$/.test(host);
function readConsent() { try { const saved = kv.getItemSync(preference); return saved === null || saved === "true"; } catch { return false; } }
export const analyticsStore = createStore(readConsent());
const budget = createAppBudget({ getItem: key => kv.getItemSync(key), setItem: (key, value) => kv.setItemSync(key, value) });

// Each instance keeps its own transport gate: opting back in cannot revive an old queue.
class ConsentClient extends PostHog {
  sending = true;
  override fetch(...args: Parameters<PostHog["fetch"]>): ReturnType<PostHog["fetch"]> {
    return this.sending ? super.fetch(...args) : Promise.resolve({ status: 200, text: async () => "{}", json: async () => ({}) });
  }
}
let client: ConsentClient | undefined;
const meta = { app_surface: "mobile", app_version: APP_VERSION, app_build: String(extra?.buildCommit ?? "unknown"), app_os: Platform.OS, $process_person_profile: false };

export function startAppAnalytics() {
  if (client || !available || !analyticsStore.get()) return;
  try {
    const id = kv.getItemSync("phaseo.analytics.id") || randomUUID();
    kv.setItemSync("phaseo.analytics.id", id);
    const instance: ConsentClient = new ConsentClient(key, {
      host, persistence: "memory", bootstrap: { distinctId: id, isIdentifiedId: false },
      defaultOptIn: true, disableGeoip: true, preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true, disableRemoteConfig: true, disableSurveys: true,
      setDefaultPersonProperties: false, captureAppLifecycleEvents: false, enableSessionReplay: false,
      capturePushNotificationSubscriptions: false, capturePushNotificationOpened: false,
      rageClickConfig: { enabled: false },
      customAppProperties: {}, flushAt: 10, flushInterval: 15000, maxQueueSize: 100,
      fetchRetryCount: 1, requestTimeout: 5000,
      errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: false, nativeCrashes: false, androidNdkCrashes: false }, exceptionSteps: { enabled: false } },
      before_send: event => {
        if (!analyticsStore.get() || !instance.sending) return null;
        const safe = filterAppEvent(event);
        if (!safe) return null;
        safe.properties = { ...safe.properties, ...meta };
        if (!budget.take(safe.event as AppAnalyticsEvent, String(safe.properties.screen_name ?? JSON.stringify(safe.properties.$exception_list)))) return null;
        return safe;
      },
    });
    client = instance;
    instance.on("error", () => {});
    instance.capture("app_opened", meta);
  } catch { /* Analytics must never prevent the app from opening. */ }
}

function stopClient() {
  if (client) {
    const previous = client; client = undefined; previous.sending = false;
    void previous.optOut().catch(() => {});
    void previous.shutdown(1000).catch(() => {});
  }
}
export function setAppAnalyticsEnabled(enabled: boolean) {
  // Revoke first, even if storage is unavailable; the previous instance stays revoked forever.
  if (!enabled) stopClient();
  try { kv.setItemSync(preference, String(enabled)); } catch { stopClient(); analyticsStore.set(false); return false; }
  analyticsStore.set(enabled);
  if (enabled) startAppAnalytics();
  return true;
}

const accountScreens = new Set(["appearance", "analytics", "chats", "credits", "diagnostics", "feedback", "keys", "licences", "licence", "notifications", "privacy", "rule", "rule-templates", "status", "usage", "whats-new", "workspace"]);
/** Expo's route patterns, never the path or its query string (which contain IDs). */
export function mobileScreen(segments: readonly string[]) {
  const parts = segments.filter(segment => !segment.startsWith("("));
  const first = parts[0] ?? "home";
  if (first === "account") return parts[1] && accountScreens.has(parts[1]) ? `account/${parts[1]}` : "account";
  if (["chat", "models", "providers"].includes(first)) return parts[1] && parts[1] !== "index" ? `${first}/detail` : first;
  return ["home", "compare", "sign-in", "notification-setup", "higher-or-lower", "version"].includes(first) ? first : undefined;
}
export function trackAppScreen(segments: readonly string[]) {
  const screen = mobileScreen(segments);
  if (screen && analyticsStore.get()) client?.capture("screen_viewed", { ...meta, screen_name: screen });
}
export function trackAppError(error: unknown, source: AppErrorSource = "render") {
  startAppAnalytics();
  if (analyticsStore.get()) client?.captureException(privateException(error), { ...meta, error_source: source });
}
