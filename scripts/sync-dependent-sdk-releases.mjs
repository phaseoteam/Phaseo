import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function version(root, directory) {
  return JSON.parse(await readFile(path.join(root, "packages/sdk", directory, "package.json"), "utf8")).version;
}

async function replace(root, file, pattern, replacement) {
  const location = path.join(root, file);
  const source = await readFile(location, "utf8");
  if (!pattern.test(source)) throw new Error(`Missing release field in ${file}: ${pattern}`);
  const next = source.replace(pattern, replacement);
  if (next !== source) await writeFile(location, next);
}

const goBase = "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go";
export function goModule(version) {
  const major = Number(version.split(".")[0]);
  if (!Number.isInteger(major) || major < 0) throw new Error(`Invalid Go version: ${version}`);
  return major < 2 ? goBase : `${goBase}/v${major}`;
}

export async function syncGoRelease(root, coreVersion) {
  const module = goModule(coreVersion);
  const modulePattern = /github\.com\/phaseoteam\/Phaseo\/packages\/sdk\/sdk-go(?:\/v\d+)?/g;
  await replace(root, "packages/sdk/sdk-go/go.mod", /^module .+$/m, `module ${module}`);
  await replace(root, "packages/sdk/agent-sdk-go/go.mod", /^require github\.com\/phaseoteam\/Phaseo\/packages\/sdk\/sdk-go[^\s]* v[^\s]+$/m, `require ${module} v${coreVersion}`);

  // Only handwritten Go sources, examples and their documentation are rewritten.
  // Generated model constants are emitted by their canonical generator below.
  const sourceDirectories = ["packages/sdk/sdk-go", "packages/sdk/sdk-go/examples", "packages/sdk/sdk-go/tests", "packages/sdk/agent-sdk-go"];
  for (const directory of sourceDirectories) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".go") || entry.name === "model_ids.go") continue;
      const file = path.join(root, directory, entry.name);
      const source = await readFile(file, "utf8");
      const next = source.replace(modulePattern, module);
      if (next !== source) await writeFile(file, next);
    }
  }
  const docs = [
    "packages/sdk/sdk-go/README.md", "packages/sdk/RELEASING.md",
    "apps/docs/v1/quickstart.mdx", "apps/docs/v1/developers/integrating-with-the-gateway.mdx",
    "apps/docs/v1/cookbook/free-router-first-deploy.mdx",
    "apps/docs/v1/cookbook/sort-providers-by-price-latency-or-throughput.mdx",
    ...(await readdir(path.join(root, "apps/docs/v1/sdk-reference/go"))).filter(name => name.endsWith(".mdx")).map(name => `apps/docs/v1/sdk-reference/go/${name}`),
  ];
  for (const file of docs) {
    const location = path.join(root, file);
    const source = await readFile(location, "utf8");
    const next = source.replace(modulePattern, module);
    if (next !== source) await writeFile(location, next);
  }
  const generated = spawnSync(process.execPath, [path.join(root, "scripts/sdk/generate-model-id-constants.mjs"), "--go-only"], { cwd: root, stdio: "inherit" });
  if (generated.error) throw generated.error;
  if (generated.status !== 0) throw new Error("Failed to regenerate Go model constants");
}

export async function syncDependentSdkReleases(root) {
  for (const language of ["py", "go", "csharp", "java", "php", "ruby"]) {
    const agent = await version(root, `agent-sdk-${language}`);
    const core = await version(root, `sdk-${language}`);
    const major = Number(core.split(".")[0]);
    const directory = `packages/sdk/agent-sdk-${language}`;
    if (language === "py") {
      await replace(root, `${directory}/pyproject.toml`, /^version = "[^"]+"/m, `version = "${agent}"`);
      await replace(root, `${directory}/pyproject.toml`, /"phaseo[^"\r\n]*"(?=,?\s*\])/m, `"phaseo>=${core},<${major + 1}.0.0"`);
      await replace(root, `${directory}/src/phaseo_agent/__init__.py`, /client_source_version="[^"]+"/g, `client_source_version="${agent}"`);
    } else if (language === "go") {
      await writeFile(path.join(root, directory, "VERSION"), `${agent}\n`);
      await replace(root, `${directory}/agent.go`, /("X-Phaseo-Client-Version"(?:\] = |, )")[^"]+/g, `$1${agent}`);
      await syncGoRelease(root, core);
    } else if (language === "csharp") {
      await replace(root, `${directory}/Phaseo.AgentSdk.csproj`, /<Version>[^<]+<\/Version>/, `<Version>${agent}</Version>`);
      await replace(root, `${directory}/AgentSdk.cs`, /("X-Phaseo-Client-Version", ")[^"]+/, `$1${agent}`);
    } else if (language === "java") {
      await replace(root, `${directory}/pom.xml`, /(<artifactId>phaseo-agent-sdk<\/artifactId>\s*<version>)[^<]+/, `$1${agent}`);
      await replace(root, `${directory}/pom.xml`, /(<phaseo.sdk.version>)[^<]+/, `$1${core}`);
      await replace(root, `${directory}/src/main/java/app/phaseo/agent/AgentSdk.java`, /("phaseo-agent-java", ")[^"]+/, `$1${agent}`);
    } else if (language === "php") {
      await writeFile(path.join(root, directory, "VERSION"), `${agent}\n`);
      await replace(root, `${directory}/composer.json`, /("phaseo\/sdk": ")[^"]+/, `$1^${core}`);
    } else if (language === "ruby") {
      await replace(root, `${directory}/phaseo_agent_sdk.gemspec`, /(spec.version\s*=\s*")[^"]+/, `$1${agent}`);
      await replace(root, `${directory}/phaseo_agent_sdk.gemspec`, /spec.add_runtime_dependency "phaseo_sdk"[^\r\n]+/, `spec.add_runtime_dependency "phaseo_sdk", ">= ${core}", "< ${major + 1}.0.0"`);
      await replace(root, `${directory}/lib/phaseo_agent_sdk.rb`, /(client_source_version: ")[^"]+/, `$1${agent}`);
    }
  }
}
