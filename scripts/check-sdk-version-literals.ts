import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

type Check = {
  filePath: string;
  pattern: RegExp;
  label: string;
};

type Spec = {
  sdkKey: "ts" | "py" | "go" | "csharp" | "java" | "php" | "ruby";
  sdkLabel: string;
  packageJsonPath: string;
  checks: Check[];
};

const SDK_VERSION_OVERRIDE_ENV: Record<Spec["sdkKey"], string> = {
  ts: "PHASEO_SDK_VERSION_OVERRIDE_TS",
  py: "PHASEO_SDK_VERSION_OVERRIDE_PY",
  go: "PHASEO_SDK_VERSION_OVERRIDE_GO",
  csharp: "PHASEO_SDK_VERSION_OVERRIDE_CSHARP",
  java: "PHASEO_SDK_VERSION_OVERRIDE_JAVA",
  php: "PHASEO_SDK_VERSION_OVERRIDE_PHP",
  ruby: "PHASEO_SDK_VERSION_OVERRIDE_RUBY",
};

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function readVersion(packageJsonPath: string): Promise<string> {
  const pkg = await readJson<{ version?: string }>(packageJsonPath);
  if (!pkg.version) {
    throw new Error(`Missing version in ${packageJsonPath}`);
  }
  return pkg.version;
}

async function readMatch(filePath: string, pattern: RegExp): Promise<string | null> {
  const raw = await fs.readFile(filePath, "utf8");
  const match = raw.match(pattern);
  if (!match) return null;
  return match[1] ?? null;
}

function file(...segments: string[]): string {
  return path.join(ROOT, ...segments);
}

function resolveExpectedVersion(spec: Spec, packageVersion: string): string {
  const overrideEnvVar = SDK_VERSION_OVERRIDE_ENV[spec.sdkKey];
  const overrideVersion = process.env[overrideEnvVar]?.trim();
  if (!overrideVersion) return packageVersion;
  console.log(`[sdk-version-check] Using ${spec.sdkLabel} override from ${overrideEnvVar}: ${overrideVersion}`);
  return overrideVersion;
}

async function main(): Promise<void> {
  const specs: Spec[] = [
    {
      sdkKey: "ts",
      sdkLabel: "TypeScript",
      packageJsonPath: file("packages", "sdk", "sdk-ts", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-ts", "src", "index.ts"),
          pattern: /new TelemetryCapture\(opts\.devtools,\s*"([^"]+)"\)/m,
          label: "TelemetryCapture construction version",
        },
        {
          filePath: file("packages", "sdk", "sdk-ts", "src", "devtools", "telemetry.ts"),
          pattern: /constructor\(config\?: Partial<DevToolsConfig>, sdkVersion: string = "([^"]+)"\)/m,
          label: "TelemetryCapture default version",
        },
      ],
    },
    {
      sdkKey: "py",
      sdkLabel: "Python",
      packageJsonPath: file("packages", "sdk", "sdk-py", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-py", "src", "ai_stats_devtools", "recorder.py"),
          pattern: /^SDK_VERSION\s*=\s*"([^"]+)"/m,
          label: "SDK_VERSION constant",
        },
      ],
    },
    {
      sdkKey: "go",
      sdkLabel: "Go",
      packageJsonPath: file("packages", "sdk", "sdk-go", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-go", "devtools.go"),
          pattern: /const goSDKVersion = "([^"]+)"/m,
          label: "goSDKVersion constant",
        },
      ],
    },
    {
      sdkKey: "csharp",
      sdkLabel: "C#",
      packageJsonPath: file("packages", "sdk", "sdk-csharp", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-csharp", "Client.cs"),
          pattern: /new TelemetryRecorder\(devtools,\s*"([^"]+)"\)/m,
          label: "TelemetryRecorder constructor version",
        },
      ],
    },
    {
      sdkKey: "java",
      sdkLabel: "Java",
      packageJsonPath: file("packages", "sdk", "sdk-java", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-java", "src", "ai", "stats", "sdk", "AIStats.java"),
          pattern: /new TelemetryRecorder\(devtoolsConfig,\s*"([^"]+)"\)/m,
          label: "TelemetryRecorder constructor version",
        },
      ],
    },
    {
      sdkKey: "php",
      sdkLabel: "PHP",
      packageJsonPath: file("packages", "sdk", "sdk-php", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-php", "src", "index.php"),
          pattern: /new TelemetryRecorder\(\$devtools,\s*"([^"]+)"\)/m,
          label: "TelemetryRecorder constructor version",
        },
      ],
    },
    {
      sdkKey: "ruby",
      sdkLabel: "Ruby",
      packageJsonPath: file("packages", "sdk", "sdk-ruby", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-ruby", "lib", "index.rb"),
          pattern: /TelemetryRecorder\.new\(devtools,\s*"([^"]+)"\)/m,
          label: "TelemetryRecorder constructor version",
        },
        {
          filePath: file("packages", "sdk", "sdk-ruby", "lib", "index.rb"),
          pattern: /def initialize\(config = nil, sdk_version = "([^"]+)"\)/m,
          label: "TelemetryRecorder default version",
        },
      ],
    },
  ];

  const failures: string[] = [];
  for (const spec of specs) {
    const packageVersion = await readVersion(spec.packageJsonPath);
    const expected = resolveExpectedVersion(spec, packageVersion);
    for (const check of spec.checks) {
      const found = await readMatch(check.filePath, check.pattern);
      if (!found) {
        failures.push(`[${spec.sdkLabel}] ${check.label}: pattern not found in ${check.filePath}`);
        continue;
      }
      if (found !== expected) {
        failures.push(
          `[${spec.sdkLabel}] ${check.label}: expected ${expected}, found ${found} (${check.filePath})`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error("[sdk-version-check] mismatches detected:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("[sdk-version-check] all SDK version literals are in sync");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
