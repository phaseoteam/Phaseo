import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

type Check = {
  filePath: string;
  pattern: RegExp;
  label: string;
};

type Spec = {
  sdkKey: "ts" | "py" | "go" | "csharp" | "java" | "php" | "ruby" | "rust" | "agentRust" | "agent";
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
  rust: "PHASEO_SDK_VERSION_OVERRIDE_RUST",
  agentRust: "PHASEO_SDK_VERSION_OVERRIDE_AGENT_RUST",
  agent: "PHASEO_SDK_VERSION_OVERRIDE_AGENT",
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
          filePath: file("packages", "sdk", "sdk-py", "src", "phaseo_devtools", "recorder.py"),
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
          filePath: file("packages", "sdk", "sdk-java", "src", "app", "phaseo", "sdk", "Phaseo.java"),
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
    {
      sdkKey: "rust",
      sdkLabel: "Rust",
      packageJsonPath: file("packages", "sdk", "sdk-rust", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "sdk-rust", "Cargo.toml"),
          pattern: /\[package\][\s\S]*?^version\s*=\s*"([^"]+)"$/m,
          label: "Cargo package version",
        },
        {
          filePath: file("packages", "sdk", "sdk-rust", "Cargo.lock"),
          pattern: /\[\[package\]\]\s+name = "phaseo"\s+version = "([^"]+)"$/m,
          label: "Cargo.lock package version",
        },
      ],
    },
    {
      sdkKey: "agentRust",
      sdkLabel: "Agent Rust",
      packageJsonPath: file("packages", "sdk", "agent-sdk-rust", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "agent-sdk-rust", "Cargo.toml"),
          pattern: /\[package\][\s\S]*?^version\s*=\s*"([^"]+)"$/m,
          label: "Cargo package version",
        },
        {
          filePath: file("packages", "sdk", "agent-sdk-rust", "Cargo.lock"),
          pattern: /\[\[package\]\]\s+name = "phaseo-agent"\s+version = "([^"]+)"$/m,
          label: "Cargo.lock package version",
        },
      ],
    },
    {
      sdkKey: "agent",
      sdkLabel: "Agent TypeScript",
      packageJsonPath: file("packages", "sdk", "agent-sdk-ts", "package.json"),
      checks: [
        {
          filePath: file("packages", "sdk", "agent-sdk-ts", "src", "devtools.ts"),
          pattern: /const AGENT_SDK_VERSION = "([^"]+)"/m,
          label: "AGENT_SDK_VERSION constant",
        },
        {
          filePath: file("packages", "sdk", "agent-sdk-ts", "src", "adapters", "gateway-client.ts"),
          pattern: /"X-Phaseo-Client-Version": "([^"]+)"/m,
          label: "gateway client attribution version",
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

  const rustSdkVersion = await readVersion(file("packages", "sdk", "sdk-rust", "package.json"));
  const rustDependencyChecks: Check[] = [
    {
      filePath: file("packages", "sdk", "agent-sdk-rust", "Cargo.toml"),
      pattern: /^phaseo\s*=\s*\{[^\r\n]*?version\s*=\s*"([^"]+)"/m,
      label: "Rust Agent SDK phaseo dependency",
    },
    {
      filePath: file("packages", "sdk", "agent-sdk-rust", "Cargo.lock"),
      pattern: /\[\[package\]\]\s+name = "phaseo"\s+version = "([^"]+)"$/m,
      label: "Rust Agent SDK locked phaseo dependency",
    },
  ];
  for (const check of rustDependencyChecks) {
    const found = await readMatch(check.filePath, check.pattern);
    if (!found) {
      failures.push(`[Agent Rust] ${check.label}: pattern not found in ${check.filePath}`);
    } else if (found !== rustSdkVersion) {
      failures.push(`[Agent Rust] ${check.label}: expected ${rustSdkVersion}, found ${found} (${check.filePath})`);
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
