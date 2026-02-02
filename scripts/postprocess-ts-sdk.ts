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
  const original = fs.readFileSync(filePath, "utf8");
  let content = original;
  let changed = false;

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

  // Dedupe imports
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  let inMultilineImport = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track if we're in a multi-line import statement
    if (trimmed.startsWith("import")) {
      if (trimmed.includes("{") && !trimmed.includes("}")) {
        inMultilineImport = true;
      }
    }

    if (inMultilineImport) {
      out.push(line);
      if (trimmed.includes("}")) {
        inMultilineImport = false;
      }
      continue;
    }

    // Only dedupe single-line import statements
    if (trimmed.startsWith("import") && trimmed.includes(";")) {
      if (seen.has(trimmed)) {
        changed = true;
        continue;
      }
      seen.add(trimmed);
    }

    out.push(line);
  }

  if (changed) {
    fs.writeFileSync(filePath, out.join("\n"), "utf8");
  }
  return changed;
}

function main() {
  const genDir = path.join(__dirname, "..", "packages", "sdk-ts", "src", "gen");
  if (!fs.existsSync(genDir)) {
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
