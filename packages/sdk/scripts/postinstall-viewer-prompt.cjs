#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const packageName = process.argv[2] || "@ai-stats/sdk";
const viewerPackage = "@ai-stats/devtools-viewer";

function hasFile(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function findAncestorWith(fileName, startDir) {
  let cur = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (hasFile(path.join(cur, fileName))) return cur;
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  return null;
}

function isRepoWorkspaceInstall() {
  const root = findAncestorWith("pnpm-workspace.yaml", process.cwd());
  if (!root) return false;
  return hasFile(path.join(root, "apps", "api", "wrangler.toml")) && hasFile(path.join(root, "turbo.json"));
}

function detectPackageManager() {
  const userAgent = String(process.env.npm_config_user_agent || "");
  if (userAgent.includes("pnpm")) return "pnpm";
  if (userAgent.includes("yarn")) return "yarn";
  return "npm";
}

function canPrompt() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (value) => {
      rl.close();
      resolve(String(value || "").trim().toLowerCase());
    });
  });
}

function runInstall(packageManager) {
  return new Promise((resolve, reject) => {
    const commands = {
      npm: ["install", "--save-dev", viewerPackage],
      pnpm: ["add", "-D", viewerPackage],
      yarn: ["add", "-D", viewerPackage],
    };
    const args = commands[packageManager] || commands.npm;
    const child = spawn(packageManager, args, { stdio: "inherit", shell: true });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`install failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const isCI =
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true" ||
    process.env.GITLAB_CI === "true" ||
    process.env.CIRCLECI === "true";
  const skip = process.env.AI_STATS_SKIP_POSTINSTALL === "true";
  const auto = process.env.AI_STATS_INSTALL_VIEWER;
  const publishing =
    process.env.npm_lifecycle_event === "publish" ||
    process.env.npm_lifecycle_event === "prepublishOnly";

  if (isCI || skip || publishing || isRepoWorkspaceInstall()) {
    return;
  }

  const packageManager = detectPackageManager();
  const hint = `[${packageName}] Optional devtools viewer: npx ${viewerPackage}`;
  const wantInstall =
    auto === "true"
      ? true
      : auto === "false"
        ? false
        : canPrompt()
          ? (await ask(`${hint}\nInstall ${viewerPackage} now? [Y/n]: `)) !== "n"
          : false;

  if (!wantInstall) {
    console.log(`${hint} (skipped)`);
    return;
  }

  try {
    await runInstall(packageManager);
    console.log(`[${packageName}] Installed ${viewerPackage}`);
  } catch {
    console.log(`[${packageName}] Could not install ${viewerPackage}. Run: npx ${viewerPackage}`);
  }
}

main().catch(() => {
  console.log(`[${packageName}] Optional viewer prompt failed. Run: npx ${viewerPackage}`);
});
