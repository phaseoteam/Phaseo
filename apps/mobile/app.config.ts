import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ExpoConfig } from "expo/config";
import { withAndroidManifest, withDangerousMod, type ConfigPlugin } from "expo/config-plugins";

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
// The website's .env.local uses PUBLIC_*; older copies may still use NEXT_PUBLIC_*.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? localWebEnvironment.PUBLIC_SUPABASE_URL
  ?? localWebEnvironment.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? localWebEnvironment.PUBLIC_SUPABASE_ANON_KEY
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

/**
 * Plain HTTP is needed by Phaseo on a computer reached directly (its phone server at a Wi-Fi or Tailscale IP has no
 * certificate) and by the perf build's chat stand-in. Phaseo's own origins stay https. Nothing secret or private
 * crosses that plain HTTP: pairing and every frame to the computer are sealed end to end with the paired keys
 * (@phaseo/phone-protocol's direct.ts), and no token is sent; only the health check and the key handshake's random
 * challenge are readable.
 */
const withCleartextTraffic: ConfigPlugin = (config) => withAndroidManifest(config, (manifest) => {
  const application = manifest.modResults.manifest.application?.[0];
  if (application) application.$["android:usesCleartextTraffic"] = "true";
  return manifest;
});

// enriched-markdown 1.1.1's consumer rule names the wrong package. Display math
// uses reflection, so release shrinking must preserve its constructor and methods.
const withNativeMath: ConfigPlugin = (config) => withDangerousMod(config, ["android", async (mod) => {
  const file = path.join(mod.modRequest.platformProjectRoot, "app/proguard-rules.pro");
  const rule = "-keep class com.swmansion.enriched.markdown.segments.MathContainerView { *; }";
  const existing = await fs.promises.readFile(file, "utf8");
  if (!existing.includes(rule)) await fs.promises.appendFile(file, `\n# Native display math is constructed through reflection.\n${rule}\n`);
  return mod;
}]);

const git = (args: string) => execSync(`git ${args}`, { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

/**
 * Which source a build came from, for Account → About and Diagnostics: the commit, when the config was read (the app
 * build embeds this config) and the build number, which is the number of commits up to HEAD, so each build from a
 * later commit gets a higher Android versionCode and iOS build number. Builds outside a git checkout leave these
 * out, and so does a shallow clone for the count, which would be meaningless there. Triage from a computer fetches
 * the source at the full commit (`buildSha`), and says when the build had uncommitted changes (`buildDirty`).
 */
function buildInfo(): { buildCommit?: string; buildSha?: string; buildDirty?: boolean; builtAt?: string; buildNumber?: number } {
  try {
    const sha = git("rev-parse HEAD");
    if (!sha) return {};
    const count = git("rev-parse --is-shallow-repository") === "true" ? Number.NaN : Number(git("rev-list --count HEAD"));
    // Untracked files count too (a new file a build imports), but only in the app and the shared packages it builds from.
    const dirty = git("status --porcelain -- . ../../packages") !== "";
    return { buildCommit: sha.slice(0, 10), buildSha: sha, ...(dirty ? { buildDirty: true } : {}), builtAt: new Date().toISOString(), ...(Number.isInteger(count) && count > 0 ? { buildNumber: count } : {}) };
  } catch {
    return {};
  }
}

const expo = appJson.expo as ExpoConfig;
const build = buildInfo();
/**
 * Android installs only replace a build with the same or a higher versionCode. android/ is generated, so prebuild
 * again after committing for the number to move on (see "Build number" in README.md).
 */
const buildNumber = build.buildNumber ?? expo.android?.versionCode ?? 1;
const base: ExpoConfig = withNativeMath({
  ...expo,
  ios: {
    ...expo.ios,
    buildNumber: String(buildNumber),
  },
  android: {
    ...expo.android,
    versionCode: buildNumber,
    ...(hasGoogleServices && !perf ? { googleServicesFile } : {}),
  },
  extra: {
    ...expo.extra,
    supabaseUrl,
    supabasePublishableKey,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY || process.env.PUBLIC_POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || localWebEnvironment.PUBLIC_POSTHOG_KEY || localWebEnvironment.NEXT_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
    ...build,
    buildNumber,
  },
});

export default perf
  ? withCleartextTraffic({
    ...base,
    name: "Phaseo Perf",
    scheme: "phaseo-perf",
    ios: { ...base.ios, bundleIdentifier: "app.phaseo.client.perf" },
    android: { ...base.android, package: "app.phaseo.client.perf" },
  })
  : withCleartextTraffic(base);
