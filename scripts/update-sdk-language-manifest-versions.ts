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
  const csprojPath = path.join(ROOT, "packages", "sdk", "sdk-csharp", "Phaseo.Sdk.csproj");
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
    /(<artifactId>phaseo-sdk<\/artifactId>\s*[\r\n]+\s*<version>)([^<]+)(<\/version>)/m,
    (match) => `${match[1]}${version}${match[3]}`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated Java package version to ${version}`);
  } else {
    console.log("[sdk-sync] Java package version already up to date");
  }
}

async function syncRubyVersion(version: string): Promise<void> {
  const versionPath = path.join(ROOT, "packages", "sdk", "sdk-ruby", "lib", "phaseo_sdk", "version.rb");
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

async function syncTypeScriptTelemetryVersion(version: string): Promise<void> {
  const sdkRoot = path.join(ROOT, "packages", "sdk", "sdk-ts", "src");
  const indexPath = path.join(sdkRoot, "index.ts");
  const telemetryPath = path.join(sdkRoot, "devtools", "telemetry.ts");

  const indexUpdated = await replaceInFile(
    indexPath,
    /new TelemetryCapture\(opts\.devtools,\s*"([^"]+)"\)/m,
    () => `new TelemetryCapture(opts.devtools, "${version}")`,
  );
  const telemetryUpdated = await replaceInFile(
    telemetryPath,
    /constructor\(config\?: Partial<DevToolsConfig>, sdkVersion: string = "([^"]+)"\)/m,
    () => `constructor(config?: Partial<DevToolsConfig>, sdkVersion: string = "${version}")`,
  );

  if (indexUpdated || telemetryUpdated) {
    console.log(`[sdk-sync] Updated TypeScript telemetry version to ${version}`);
  } else {
    console.log("[sdk-sync] TypeScript telemetry version already up to date");
  }
}

async function syncPythonTelemetryVersion(version: string): Promise<void> {
  const recorderPath = path.join(ROOT, "packages", "sdk", "sdk-py", "src", "phaseo_devtools", "recorder.py");
  const updated = await replaceInFile(
    recorderPath,
    /^SDK_VERSION\s*=\s*"[^"]+"/m,
    () => `SDK_VERSION = "${version}"`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated Python telemetry version to ${version}`);
  } else {
    console.log("[sdk-sync] Python telemetry version already up to date");
  }
}

async function syncGoTelemetryVersion(version: string): Promise<void> {
  const devtoolsPath = path.join(ROOT, "packages", "sdk", "sdk-go", "devtools.go");
  const updated = await replaceInFile(
    devtoolsPath,
    /const goSDKVersion = "([^"]+)"/m,
    () => `const goSDKVersion = "${version}"`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated Go telemetry version to ${version}`);
  } else {
    console.log("[sdk-sync] Go telemetry version already up to date");
  }
}

async function syncCsharpTelemetryVersion(version: string): Promise<void> {
  const clientPath = path.join(ROOT, "packages", "sdk", "sdk-csharp", "Client.cs");
  const updated = await replaceInFile(
    clientPath,
    /new TelemetryRecorder\(devtools,\s*"([^"]+)"\)/m,
    () => `new TelemetryRecorder(devtools, "${version}")`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated C# telemetry version to ${version}`);
  } else {
    console.log("[sdk-sync] C# telemetry version already up to date");
  }
}

async function syncJavaTelemetryVersion(version: string): Promise<void> {
  const aiStatsPath = path.join(ROOT, "packages", "sdk", "sdk-java", "src", "app", "phaseo", "sdk", "Phaseo.java");
  const updated = await replaceInFile(
    aiStatsPath,
    /new TelemetryRecorder\(devtoolsConfig,\s*"([^"]+)"\)/m,
    () => `new TelemetryRecorder(devtoolsConfig, "${version}")`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated Java telemetry version to ${version}`);
  } else {
    console.log("[sdk-sync] Java telemetry version already up to date");
  }
}

async function syncPhpTelemetryVersion(version: string): Promise<void> {
  const indexPath = path.join(ROOT, "packages", "sdk", "sdk-php", "src", "index.php");
  const updated = await replaceInFile(
    indexPath,
    /new TelemetryRecorder\(\$devtools,\s*"([^"]+)"\)/m,
    () => `new TelemetryRecorder($devtools, "${version}")`,
  );
  if (updated) {
    console.log(`[sdk-sync] Updated PHP telemetry version to ${version}`);
  } else {
    console.log("[sdk-sync] PHP telemetry version already up to date");
  }
}

async function syncRubyTelemetryVersion(version: string): Promise<void> {
  const indexPath = path.join(ROOT, "packages", "sdk", "sdk-ruby", "lib", "index.rb");
  const constructorUpdated = await replaceInFile(
    indexPath,
    /TelemetryRecorder\.new\(devtools,\s*"([^"]+)"\)/m,
    () => `TelemetryRecorder.new(devtools, "${version}")`,
  );
  const initializerUpdated = await replaceInFile(
    indexPath,
    /def initialize\(config = nil, sdk_version = "([^"]+)"\)/m,
    () => `def initialize(config = nil, sdk_version = "${version}")`,
  );
  if (constructorUpdated || initializerUpdated) {
    console.log(`[sdk-sync] Updated Ruby telemetry version to ${version}`);
  } else {
    console.log("[sdk-sync] Ruby telemetry version already up to date");
  }
}

async function syncAll(): Promise<void> {
  const syncConfigs: NpmPackageVersionConfig[] = [
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-ts", "package.json"),
      apply: syncTypeScriptTelemetryVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-py", "package.json"),
      apply: syncPythonTelemetryVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-go", "package.json"),
      apply: syncGoTelemetryVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-csharp", "package.json"),
      apply: syncCsharpVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-csharp", "package.json"),
      apply: syncCsharpTelemetryVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-java", "package.json"),
      apply: syncJavaVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-java", "package.json"),
      apply: syncJavaTelemetryVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-php", "package.json"),
      apply: syncPhpTelemetryVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-ruby", "package.json"),
      apply: syncRubyVersion,
    },
    {
      packageJsonPath: path.join(ROOT, "packages", "sdk", "sdk-ruby", "package.json"),
      apply: syncRubyTelemetryVersion,
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
