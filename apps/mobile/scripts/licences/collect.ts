import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Open source licences shipped with the app, built from `pnpm licenses list --prod` and each package's own licence
 * files. Run by scripts/licences.mjs (Node strips the types) and by the Jest check that keeps the output current.
 *
 * The output stays small: identical licence texts are stored once. Copyright lines are taken out of each text (so
 * MIT texts that differ only in their copyright line share one copy) and kept per package, then put back exactly
 * where they were when the text is shown.
 */

/** One entry of `pnpm licenses list --json` (grouped by licence). */
export type PnpmLicenceEntry = { name: string; versions: string[]; paths: string[]; license?: string; author?: string };
export type PackageFiles = { name: string; version: string; licence: string; author: string | null; files: { name: string; text: string }[] };

/** [name, version, licence, text index (-1 without a licence file), copyright blocks, author when there are no blocks] */
export type LicencePackage = [string, string, string, number, string[], string?];
export type LicenceData = { source: string; texts: string[]; packages: LicencePackage[] };

export const SOURCE = "pnpm licenses list --prod";
/** Marks a line of a stored text where a package's copyright block goes back in. */
export const MARK = "\u0000";

const LICENCE_FILE = /^(?:licen[cs]e|copying|notice)(?:[-._].*)?$/i;
const COPYRIGHT = /^\s*(?:copyright\b|\(c\)\s|©)/i;
/**
 * The unfilled line of a licence's template ("Copyright [yyyy] [name of copyright owner]" in Apache-2.0's appendix).
 * It is still taken out like a real copyright line, so filled and unfilled copies of a licence share one text, but it
 * isn't shown as the package's copyright.
 */
export const TEMPLATE_LINE = /\[(?:yyyy|year|name of copyright owner)\]|<(?:year|owner|copyright holders?)>|\{yyyy\}/i;

/** Line endings, trailing spaces and runs of blank lines vary between copies of the same licence. */
export function normaliseText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
}

/** Takes the copyright lines out of a licence text: each run of them becomes one MARK line in the template. */
export function splitCopyright(text: string): { template: string; blocks: string[] } {
  const out: string[] = [];
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of text.split("\n")) {
    if (COPYRIGHT.test(line)) {
      if (!current) {
        current = [];
        blocks.push(current);
        out.push(MARK);
      }
      current.push(line.trim());
    } else {
      current = null;
      out.push(line);
    }
  }
  return { template: out.join("\n"), blocks: blocks.map((block) => block.join("\n")) };
}

/** The full text again: each MARK line replaced by the package's block, in order. */
export function joinCopyright(template: string, blocks: string[]): string {
  let index = 0;
  return template.split("\n").map((line) => (line === MARK ? blocks[index++] ?? "" : line)).join("\n");
}

/** Licence files first (LICENSE before LICENSE-MIT), notices last. */
function fileOrder(a: string, b: string) {
  const rank = (name: string) => (/^notice/i.test(name) ? 2 : /^licen[cs]e(\.[a-z]+)?$/i.test(name) ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** One text per package: its licence files, each under its file name when there are several. */
export function packageText(files: { name: string; text: string }[]): string | null {
  const texts = [...files].sort((a, b) => fileOrder(a.name, b.name)).map((file) => ({ name: file.name, text: normaliseText(file.text) })).filter((file) => file.text);
  if (!texts.length) return null;
  if (texts.length === 1) return texts[0]!.text;
  return texts.map((file) => `${file.name}\n\n${file.text}`).join("\n\n");
}

/** Builds the stored list: packages sorted by name and version, identical texts stored once. */
export function buildLicenceData(packages: PackageFiles[]): LicenceData {
  const texts: string[] = [];
  const indexOf = new Map<string, number>();
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version, "en", { numeric: true }));
  const out: LicencePackage[] = [];
  for (const entry of sorted) {
    const text = packageText(entry.files);
    let index = -1;
    let blocks: string[] = [];
    if (text) {
      const split = splitCopyright(text);
      blocks = split.blocks;
      index = indexOf.get(split.template) ?? -1;
      if (index === -1) {
        index = texts.push(split.template) - 1;
        indexOf.set(split.template, index);
      }
    }
    const row: LicencePackage = [entry.name, entry.version, entry.licence, index, blocks];
    if (!blocks.length && entry.author) row.push(entry.author);
    out.push(row);
  }
  return { source: SOURCE, texts, packages: out };
}

/**
 * Reads each listed package's licence files. Packages built for one OS or CPU (build-tool binaries such as
 * lightningcss-win32-x64-msvc) are left out, so the list is the same on every machine.
 */
export function readPackages(listing: Record<string, PnpmLicenceEntry[]>): PackageFiles[] {
  const packages: PackageFiles[] = [];
  const seen = new Set<string>();
  for (const [licence, entries] of Object.entries(listing)) {
    for (const entry of entries) {
      entry.versions.forEach((version, index) => {
        const dir = entry.paths[index];
        const key = `${entry.name}@${version}`;
        if (!dir || seen.has(key)) return;
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { os?: unknown; cpu?: unknown };
        if (manifest.os || manifest.cpu) return;
        seen.add(key);
        const files = fs.readdirSync(dir)
          .filter((name) => LICENCE_FILE.test(name) && fs.statSync(path.join(dir, name)).isFile())
          .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));
        packages.push({ name: entry.name, version, licence: entry.license ?? licence, author: entry.author?.trim() || null, files });
      });
    }
  }
  return packages;
}

/** Lists the app's production dependencies with pnpm, from the repository root so only this package is listed. */
export function listProductionDependencies(appDir: string): Record<string, PnpmLicenceEntry[]> {
  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")) as { name: string };
  const root = path.resolve(appDir, "../..");
  const output = execSync(`pnpm --filter ${manifest.name} licenses list --prod --json`, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(output.slice(output.indexOf("{"))) as Record<string, PnpmLicenceEntry[]>;
}

export const OUTPUT = "src/features/account/licences.generated.json";

export function generateLicenceData(appDir: string): LicenceData {
  return buildLicenceData(readPackages(listProductionDependencies(appDir)));
}

export function serialise(data: LicenceData): string {
  return `${JSON.stringify(data)}\n`;
}
