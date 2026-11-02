import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hash as translationSourceHash } from "../apps/docs/scripts/translation-freshness.mjs";

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

const docsLocales = ["ar", "de", "es", "fr", "hi", "ja", "pt-BR", "zh-Hans"];

// Every file under `directory` with one of `extensions`. Changelogs are history and
// keep the module path they were written with; generated code comes from its generator.
async function listFiles(root, directory, extensions) {
  const files = [];
  const walk = async (relative) => {
    let entries;
    try {
      entries = await readdir(path.join(root, relative), { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!["node_modules", "changelog", "gen"].includes(entry.name)) await walk(child);
      } else if (extensions.some(extension => entry.name.endsWith(extension)) && entry.name !== "model_ids.go" && !/^CHANGELOG/i.test(entry.name)) {
        files.push(child);
      }
    }
  };
  await walk(directory);
  return files;
}

// A module path is code, not prose, so translated pages get the same rewrite, and a
// translation that matched the old English page still matches the new one.
async function syncGoDocs(root, rewrite) {
  const changed = new Map();
  for (const file of await listFiles(root, "apps/docs/v1", [".md", ".mdx"])) {
    const source = await readFile(path.join(root, file), "utf8");
    const next = rewrite(source);
    if (next === source) continue;
    await writeFile(path.join(root, file), next);
    changed.set(file.slice("apps/docs/v1/".length), { before: translationSourceHash(source), after: translationSourceHash(next) });
  }
  for (const locale of docsLocales) {
    for (const file of await listFiles(root, `apps/docs/${locale}/v1`, [".md", ".mdx"])) {
      const source = await readFile(path.join(root, file), "utf8");
      const next = rewrite(source);
      if (next !== source) await writeFile(path.join(root, file), next);
    }
  }
  if (changed.size === 0) return;
  const manifestPath = path.join(root, "apps/docs/translation-status.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const recorded of Object.values(manifest.locales)) {
    for (const [page, { before, after }] of changed) {
      if (recorded[page] === before) recorded[page] = after;
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function syncGoRelease(root, coreVersion) {
  const module = goModule(coreVersion);
  const modulePattern = /github\.com\/phaseoteam\/Phaseo\/packages\/sdk\/sdk-go(?:\/v\d+)?/g;
  // Prose and package pickers name the module by its short form, e.g. `sdk-go/v3`.
  const shortModulePattern = /(?<![\w-])sdk-go\/v\d+\b/g;
  const shortModule = module.slice(module.lastIndexOf("sdk-go"));
  const rewrite = source => source.replace(modulePattern, module).replace(shortModulePattern, shortModule);
  await replace(root, "packages/sdk/sdk-go/go.mod", /^module .+$/m, `module ${module}`);
  await replace(root, "packages/sdk/agent-sdk-go/go.mod", /^require github\.com\/phaseoteam\/Phaseo\/packages\/sdk\/sdk-go[^\s]* v[^\s]+$/m, `require ${module} v${coreVersion}`);

  // Go sources in every package directory, the docs in all their languages and the
  // website's code samples. Generated model constants come from their generator below.
  const files = [
    ...(await listFiles(root, "packages/sdk/sdk-go", [".go", ".md"])),
    ...(await listFiles(root, "packages/sdk/agent-sdk-go", [".go", ".md"])),
    "packages/sdk/RELEASING.md",
    ...(await listFiles(root, "apps/web/src", [".ts", ".tsx"])),
  ];
  for (const file of files) {
    const location = path.join(root, file);
    const source = await readFile(location, "utf8");
    const next = rewrite(source);
    if (next !== source) await writeFile(location, next);
  }
  await syncGoDocs(root, rewrite);

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
      await replace(root, `${directory}/src/AgentSdk.php`, /(clientSourceVersion: ")[^"]+/, `$1${agent}`);
    } else if (language === "ruby") {
      await replace(root, `${directory}/phaseo_agent_sdk.gemspec`, /(spec.version\s*=\s*")[^"]+/, `$1${agent}`);
      await replace(root, `${directory}/phaseo_agent_sdk.gemspec`, /spec.add_runtime_dependency "phaseo_sdk"[^\r\n]+/, `spec.add_runtime_dependency "phaseo_sdk", ">= ${core}", "< ${major + 1}.0.0"`);
      await replace(root, `${directory}/lib/phaseo_agent_sdk.rb`, /(client_source_version: ")[^"]+/, `$1${agent}`);
    }
  }
}
