import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ExpoConfig } from "expo/config";
import { withAndroidManifest, type ConfigPlugin } from "expo/config-plugins";

import appJson from "./app.json";

function readLocalWebEnvironment() {
  const values: Record<string, string> = {};
  const file = path.resolve(__dirname, "../web/.env.local");

  if (!fs.existsSync(file)) return values;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || rawValue == null) continue;
    values[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }

  return values;
}

const localWebEnvironment = readLocalWebEnvironment();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? localWebEnvironment.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? localWebEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Firebase's Android config, needed for push. It holds public identifiers only, so it is
// committed; builds without it still work but can't receive notifications.
const googleServicesFile = "./google-services.json";
const hasGoogleServices = fs.existsSync(path.resolve(__dirname, googleServicesFile));

/**
 * `APP_VARIANT=perf` builds "Phaseo Perf" (app.phaseo.client.perf), a separate app for load tests that
 * installs beside the real one and never shares its chats. Its perf tools (seeder, timing spans, a local
 * chat stand-in) are bundled only when `EXPO_PUBLIC_PERF_TOOLS=1`, so normal builds leave them out.
 * See "Load tests" in README.md.
 */
const perf = process.env.APP_VARIANT === "perf";
if (perf !== (process.env.EXPO_PUBLIC_PERF_TOOLS === "1")) {
  throw new Error("Set APP_VARIANT=perf and EXPO_PUBLIC_PERF_TOOLS=1 together for the perf build, and neither for a normal build.");
}

/** The perf build talks plain HTTP to the chat stand-in on the development machine. */
const withCleartextTraffic: ConfigPlugin = (config) => withAndroidManifest(config, (manifest) => {
  const application = manifest.modResults.manifest.application?.[0];
  if (application) application.$["android:usesCleartextTraffic"] = "true";
  return manifest;
});

/**
 * Which source a build came from, for Account → Diagnostics: the commit and when the config was read (the app
 * build embeds this config). Builds outside a git checkout leave it out.
 */
function buildInfo() {
  try {
    const commit = execSync("git rev-parse --short=10 HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return commit ? { buildCommit: commit, builtAt: new Date().toISOString() } : {};
  } catch {
    return {};
  }
}

const expo = appJson.expo as ExpoConfig;
const base: ExpoConfig = {
  ...expo,
  android: {
    ...expo.android,
    ...(hasGoogleServices && !perf ? { googleServicesFile } : {}),
  },
  extra: {
    ...expo.extra,
    supabaseUrl,
    supabasePublishableKey,
    ...buildInfo(),
  },
};

export default perf
  ? withCleartextTraffic({
    ...base,
    name: "Phaseo Perf",
    scheme: "phaseo-perf",
    ios: { ...base.ios, bundleIdentifier: "app.phaseo.client.perf" },
    android: { ...base.android, package: "app.phaseo.client.perf" },
  })
  : base;
