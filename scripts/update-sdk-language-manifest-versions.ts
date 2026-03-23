import fs from "node:fs/promises";
import path from "node:path";

type NpmPackageVersionConfig = {
  packageJsonPath: string;
  apply: (version: string) => Promise<void>;
};

const ROOT = path.resolve(__dirname, "..");

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function replaceInFile(
  filePath: string,
  pattern: RegExp,
  replacement: (match: RegExpExecArray) => string,
): Promise<boolean> {
  const source = await fs.readFile(filePath, "utf8");
  const match = pattern.exec(source);
  if (!match) return false;
  const updated = `${source.slice(0, match.index)}${replacement(match)}${source.slice(match.index + match[0].length)}`;
  if (updated === source) return false;
  await fs.writeFile(filePath, updated, "utf8");
  return true;
}

async function syncCsharpVersion(version: string): Promise<void> {
  const csprojPath = path.join(ROOT, "packages", "sdk", "sdk-csharp", "AIStats.Sdk.csproj");
  const updated = await replaceInFile(
    csprojPath,
    /<Version>([^<]+)<\/Version>/m,
    () => `<Version>${version}</Version>`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated C# package version to ${version}`);
  } else {
    console.log("[sdk-sync] C# package version already up to date");
  }
}

async function syncJavaVersion(version: string): Promise<void> {
  const pomPath = path.join(ROOT, "packages", "sdk", "sdk-java", "pom.xml");
  const updated = await replaceInFile(
    pomPath,
    /(<artifactId>ai-stats-sdk<\/artifactId>\s*[\r\n]+\s*<version>)([^<]+)(<\/version>)/m,
    (match) => `${match[1]}${version}${match[3]}`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated Java package version to ${version}`);
  } else {
    console.log("[sdk-sync] Java package version already up to date");
  }
}

async function syncRubyVersion(version: string): Promise<void> {
  const versionPath = path.join(ROOT, "packages", "sdk", "sdk-ruby", "lib", "ai_stats_sdk", "version.rb");
  const updated = await replaceInFile(
    versionPath,
    /VERSION\s*=\s*"[^"]+"/m,
    () => `VERSION = "${version}"`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated Ruby package version to ${version}`);
  } else {
    console.log("[sdk-sync] Ruby package version already up to date");
  }
}

async function syncAll(): Promise<void> {
  const syncConfigs: NpmPackageVersionConfig[] = [
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-csharp", "package.json"),
      apply: syncCsharpVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-java", "package.json"),
      apply: syncJavaVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-ruby", "package.json"),
      apply: syncRubyVersion,
    },
  ];

  for (const config of syncConfigs) {
    const pkg = await readJson<{ version?: string }>(config.packageJsonPath);
    if (!pkg.version) {
      throw new Error(`Missing version in ${config.packageJsonPath}`);
    }
    await config.apply(pkg.version);
  }
}

syncAll().catch((error) => {
  console.error(error);
  process.exit(1);
});
