import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PACKAGE_NAME = "@ai-stats/sdk";
const PACKAGE_DIR = path.resolve("packages/sdk/sdk-ts");
const PACKAGE_JSON_PATH = path.join(PACKAGE_DIR, "package.json");
const DUPLICATE_VERSION_RE = /cannot publish over the previously published versions/i;
const REGISTRY_WAIT_MS = 90_000;
const REGISTRY_POLL_MS = 5_000;

function readExpectedVersion() {
  const raw = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed?.version) {
    throw new Error(`Missing version in ${PACKAGE_JSON_PATH}`);
  }
  return parsed.version;
}

function getPublishedVersion() {
  try {
    const raw = execSync(`npm view ${PACKAGE_NAME} version --json`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.at(-1) ?? null;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function publishTsSdk() {
  const result = spawnSync(
    "npm",
    ["publish", "--access", "public", "--provenance"],
    {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if ((result.status ?? 1) === 0) return;
  if (DUPLICATE_VERSION_RE.test(output)) {
    console.log("[publish-check] npm reported duplicate version; continuing to verify.");
    return;
  }

  throw new Error(
    `[publish-check] npm publish failed with status ${result.status ?? 1}`,
  );
}

async function waitForRegistryVersion(expectedVersion) {
  const deadline = Date.now() + REGISTRY_WAIT_MS;
  while (Date.now() < deadline) {
    const current = getPublishedVersion();
    if (current === expectedVersion) return true;
    await sleep(REGISTRY_POLL_MS);
  }
  return false;
}

async function main() {
  const expected = readExpectedVersion();
  const current = getPublishedVersion();
  console.log(
    `[publish-check] expected ${PACKAGE_NAME}@${expected}; npm currently reports ${
      current ?? "unknown"
    }`,
  );

  if (current === expected) {
    console.log("[publish-check] TS SDK version already published.");
    return;
  }

  console.log("[publish-check] TS SDK missing on npm; attempting publish fallback.");
  publishTsSdk();

  const published = await waitForRegistryVersion(expected);
  if (!published) {
    const latest = getPublishedVersion();
    throw new Error(
      `[publish-check] TS SDK publish verification failed. Expected ${expected}, got ${
        latest ?? "unknown"
      }`,
    );
  }

  console.log("[publish-check] TS SDK publish verified.");
}

await main();
