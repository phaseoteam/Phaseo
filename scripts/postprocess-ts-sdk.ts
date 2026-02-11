import fs from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function dedupeImports(filePath: string): boolean {
  if (path.basename(filePath) === "runtime.ts") {
    return false;
  }

  const original = fs.readFileSync(filePath, "utf8");
  let content = original;
  let changed = false;

  const appendMissingInstanceOfGuards = () => {
    const typeRegex = /export type (\w+) = ([^;]+);/g;
    let typeMatch: RegExpExecArray | null = null;
    while ((typeMatch = typeRegex.exec(content)) !== null) {
      const typeName = typeMatch[1];
      const typeBody = typeMatch[2];
      const guardName = `instanceOf${typeName}`;
      if (content.includes(`export function ${guardName}(`)) continue;

      const unionMembers = typeBody
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      const memberGuards = unionMembers
        .map((member) => member.replace(/\[\]$/, ""))
        .filter((member) => /^[A-Z]\w+$/.test(member))
        .map((member) => `instanceOf${member}(value as any)`)
        .filter((guard) => content.includes(guard.replace("(value as any)", "")));
      const guardExpr = memberGuards.length > 0 ? memberGuards.join(" || ") : "true";
      const guardFn = `\n\nexport function ${guardName}(value: any): value is ${typeName} {\n    return ${guardExpr};\n}`;
      content = content.replace(typeMatch[0], `${typeMatch[0]}${guardFn}`);
      changed = true;
    }
  };

  const dedupeImportBlocks = () => {
    const lines = content.split(/\r?\n/);
    const out: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed.startsWith("import")) {
        out.push(line);
        continue;
      }

      const block: string[] = [line];
      while (i + 1 < lines.length && !lines[i].includes(";")) {
        i += 1;
        block.push(lines[i]);
      }
      const blockText = block.join("\n");
      if (/from ['"]\.\/string['"]/.test(blockText)) {
        changed = true;
        continue;
      }
      const key = blockText.trim();
      if (seen.has(key)) {
        changed = true;
        continue;
      }
      seen.add(key);
      out.push(...block);
    }
    content = out.join("\n");
  };

  // Fix HTML entities in imports and code
  const htmlEntityFixes = [
    [/&lt;/g, "<"],
    [/&gt;/g, ">"],
    [/&amp;/g, "&"],
    [/&quot;/g, '"'],
  ];

  for (const [regex, replacement] of htmlEntityFixes) {
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      changed = true;
    }
  }

  // Remove invalid import statements for generics like "import ... from './Array<string>'"
  const invalidImportPattern = /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]\.\/Array<[^>]+>['"];?\s*\n?/g;
  if (invalidImportPattern.test(content)) {
    content = content.replace(invalidImportPattern, "");
    changed = true;
  }

  // Fix invalid function calls like "string | Array<string>FromJSON"
  // These should just be the value, not a function call
  const invalidFunctionCallPattern = /string\s*\|\s*Array<string>(?:From|To)JSON\(([^)]+)\)/g;
  if (invalidFunctionCallPattern.test(content)) {
    content = content.replace(invalidFunctionCallPattern, "$1");
    changed = true;
  }

  // Fix array mapper variable shadowing in certain generated union serializers.
  const valueMapCastPattern = /return value\.map\(value => (\w+ToJSON)\(value as (\w+)\)\);/g;
  if (valueMapCastPattern.test(content)) {
    content = content.replace(
      valueMapCastPattern,
      "return value.map((item) => $1(item as $2));",
    );
    changed = true;
  }

  // Fix enum-cast strictness issue in generated union serializers.
  const enumUnionCastPattern = /OrganisationIdToJSON\(([^)]+) as OrganisationId\)/g;
  if (enumUnionCastPattern.test(content)) {
    content = content.replace(
      enumUnionCastPattern,
      "OrganisationIdToJSON($1 as unknown as OrganisationId)",
    );
    changed = true;
  }

  // Normalize primitive union typeof checks to deterministic ordering so
  // generator output is stable across platforms/runner environments.
  const normalizePrimitiveTypeofBlocks = (source: string, varName: "json" | "value"): string => {
    const blockRegex = new RegExp(
      `((?:\\s*if \\(typeof ${varName} === '[^']+'\\) {\\s*return ${varName};\\s*}\\s*){2,})`,
      "g",
    );

    return source.replace(blockRegex, (block) => {
      const entryRegex = new RegExp(
        `\\s*if \\(typeof ${varName} === '([^']+)'\\) {\\s*return ${varName};\\s*}\\s*`,
        "g",
      );
      const seen = new Set<string>();
      const types: string[] = [];
      let match: RegExpExecArray | null = null;
      while ((match = entryRegex.exec(block)) !== null) {
        const t = match[1];
        if (!seen.has(t)) {
          seen.add(t);
          types.push(t);
        }
      }
      if (types.length < 2) return block;

      const rank = (t: string) => {
        switch (t) {
          case "number":
            return 0;
          case "string":
            return 1;
          case "boolean":
            return 2;
          case "bigint":
            return 3;
          case "symbol":
            return 4;
          case "function":
            return 5;
          case "undefined":
            return 6;
          case "object":
            return 7;
          default:
            return 99;
        }
      };

      const sorted = [...types].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
      if (sorted.join("|") === types.join("|")) return block;

      const indentMatch = block.match(/^(\s*)if /);
      const indent = indentMatch ? indentMatch[1] : "    ";
      const rebuilt = sorted
        .map((t) => `${indent}if (typeof ${varName} === '${t}') {\n${indent}    return ${varName};\n${indent}}\n`)
        .join("");
      return rebuilt;
    });
  };

  const normalizedTypeof = normalizePrimitiveTypeofBlocks(
    normalizePrimitiveTypeofBlocks(content, "json"),
    "value",
  );
  if (normalizedTypeof !== content) {
    content = normalizedTypeof;
    changed = true;
  }

  dedupeImportBlocks();
  if (filePath.includes(`${path.sep}models${path.sep}`)) {
    appendMissingInstanceOfGuards();
  }

  if (changed) {
    fs.writeFileSync(filePath, content, "utf8");
  }
  return changed;
}

function main() {
  const candidates = [
    path.join(__dirname, "..", "packages", "sdk", "sdk-ts", "src", "gen"),
    path.join(__dirname, "..", "packages", "sdk-ts", "src", "gen"),
  ];
  const genDir = candidates.find((dir) => fs.existsSync(dir));
  if (!genDir) {
    console.warn("[postprocess-ts-sdk] Generated directory not found, skipping.");
    return;
  }
  const files = walk(genDir);
  let touched = 0;
  for (const file of files) {
    if (dedupeImports(file)) touched += 1;
  }
  if (touched > 0) {
    console.log(`[postprocess-ts-sdk] Deduped imports in ${touched} files`);
  }
}

main();
