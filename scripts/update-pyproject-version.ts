import fs from "node:fs/promises";
import path from "node:path";

async function firstExistingPath(paths: string[]) {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next path
    }
  }
  throw new Error(`Unable to find any of the expected files:\n${paths.join("\n")}`);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const pkgPath = await firstExistingPath([
    path.join(root, "packages", "sdk", "sdk-py", "package.json"),
    path.join(root, "packages", "sdk-py", "package.json"),
  ]);
  const pyprojectPath = await firstExistingPath([
    path.join(root, "packages", "sdk", "sdk-py", "pyproject.toml"),
    path.join(root, "packages", "sdk-py", "pyproject.toml"),
  ]);

  const [pkgRaw, pyprojectRaw] = await Promise.all([
    fs.readFile(pkgPath, "utf8"),
    fs.readFile(pyprojectPath, "utf8"),
  ]);

  const { version } = JSON.parse(pkgRaw);
  if (!version) {
    throw new Error(`${pkgPath} is missing a version`);
  }

  const versionPattern = /^(version\s*=\s*").+?(")/m;
  const matches = versionPattern.test(pyprojectRaw);
  if (!matches) {
    throw new Error(`Could not locate version field in ${pyprojectPath}`);
  }
  const updated = pyprojectRaw.replace(versionPattern, `$1${version}$2`);

  if (updated === pyprojectRaw) {
    console.log("pyproject.toml already matched the workspace version");
    return;
  }

  await fs.writeFile(pyprojectPath, updated, "utf8");
  console.log(`pyproject.toml version synced to ${version}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
