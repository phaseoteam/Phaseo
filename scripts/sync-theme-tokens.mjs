// Writes the theme tokens from packages/shared/app-kit/src/theme/tokens.ts into each app's CSS:
// a generated file the website, the desktop app and Factory import, and the generated block of the
// mobile app's global.css (Uniwind's format). Run with --check in CI to fail on drift instead of writing.
//
// Plain Node, no dependencies: it loads the TypeScript sources with Node's type stripping.
//   node --experimental-strip-types scripts/sync-theme-tokens.mjs [--check]
// (pnpm run theme:sync-tokens, or pnpm run validate:theme-tokens to check)

import { readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// app-kit's modules import each other without an extension, as the apps' bundlers expect. Node needs
// one, so relative imports that aren't found are retried with ".ts".
register(
	"data:text/javascript," +
		encodeURIComponent(`export async function resolve(specifier, context, next) {
	try {
		return await next(specifier, context);
	} catch (error) {
		if (error?.code !== "ERR_MODULE_NOT_FOUND" || !/^\\.\\.?\\//.test(specifier) || specifier.endsWith(".ts")) throw error;
		return next(specifier + ".ts", context);
	}
}`),
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/app-kit/src/theme/tokens.ts";
const theme = await import(pathToFileURL(path.join(root, "packages/shared/app-kit/src/theme/index.ts")).href);
const { DARK_PALETTES, DEFAULT_THEME, LIGHT_PALETTES, PALETTE_TOKENS, RADIUS_BASE_PX, STATUS_COLOURS, readableForegroundForAccent, themeVariables } = theme;

const check = process.argv.includes("--check");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const header = (comment) => `/* Generated from ${SOURCE} by scripts/sync-theme-tokens.mjs.
   Do not edit: change tokens.ts, then run \`pnpm run theme:sync-tokens\`.${comment ? `\n   ${comment}` : ""} */`;
const block = (selector, tokens, indent = "\t", depth = 0) => {
	const outer = indent.repeat(depth);
	const lines = Object.entries(tokens).map(([name, value]) => `${outer}${indent}${name}: ${value};`);
	return `${outer}${selector} {\n${lines.join("\n")}\n${outer}}`;
};
const named = (tokens, prefix = "--") => Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`${prefix}${name}`, value]));
const radius = { "--radius": `${RADIUS_BASE_PX / 16}rem` };
// Only the mobile app fills buttons with the destructive colour; the others tint them, so they have no
// destructive-foreground.
const status = (scheme) => named(Object.fromEntries(Object.entries(STATUS_COLOURS[scheme]).filter(([name]) => name !== "destructive-foreground")));
const accent = (scheme) => {
	const colour = scheme === "light" ? DEFAULT_THEME.lightAccent : DEFAULT_THEME.darkAccent;
	return { "--primary": colour, "--primary-foreground": readableForegroundForAccent(colour), "--ring": colour };
};

/** The website: the Phaseo palettes (:root and .dark), the other palettes and the status colours. The accent blocks stay in globals.css. */
function websiteTokens() {
	const blocks = [
		block(":root", { ...radius, ...named(PALETTE_TOKENS.light.phaseo), ...status("light") }),
		block(".dark", { ...named(PALETTE_TOKENS.dark.phaseo), ...status("dark") }),
		...LIGHT_PALETTES.filter((name) => name !== "phaseo").map((name) => block(`:root[data-light-palette="${name}"]:not(.dark)`, named(PALETTE_TOKENS.light[name]))),
		...DARK_PALETTES.filter((name) => name !== "phaseo").map((name) => block(`:root.dark[data-dark-palette="${name}"]`, named(PALETTE_TOKENS.dark[name]))),
	];
	return `${header("globals.css imports this file and derives primary, ring and the charts from the accent.")}\n\n${blocks.join("\n\n")}\n`;
}

/** The desktop app and Factory: the Phaseo theme, with the default accents as primary and ring. */
function electronTokens(comment) {
	const blocks = [
		block(":root", { ...radius, ...named(PALETTE_TOKENS.light.phaseo), ...accent("light"), ...status("light") }),
		block(".dark", { ...named(PALETTE_TOKENS.dark.phaseo), ...accent("dark"), ...status("dark") }),
	];
	return `${header(comment)}\n\n${blocks.join("\n\n")}\n`;
}

const MOBILE_START = "/* Generated from";
const MOBILE_END = "/* End of generated tokens. */";

/** The mobile app: Uniwind's light and dark variants of the Phaseo theme, which the app swaps for the chosen theme at launch. */
function mobileTokens() {
	const variant = (scheme) => block(`@variant ${scheme}`, { ...themeVariables(DEFAULT_THEME, scheme), ...named(STATUS_COLOURS[scheme], "--color-") }, "  ", 2);
	return `${header("src/lib/theme/store.ts replaces the surface, primary, ring, link and chart colours at launch.")}
@layer theme {
  :root {
${variant("light")}

${variant("dark")}
  }
}
${MOBILE_END}`;
}

const problems = [];
async function sync(file, expected) {
	const current = await readFile(path.join(root, file), "utf8").catch(() => null);
	if (current != null && normalize(current) === expected) return;
	if (check) problems.push(`${file} is out of date`);
	else await writeFile(path.join(root, file), expected, "utf8");
}

await sync("apps/web/src/app/theme-tokens.generated.css", websiteTokens());
await sync("apps/desktop/src/renderer/theme-tokens.generated.css", electronTokens("index.css imports this file. A theme chosen in Settings (src/renderer/lib/themes.ts) overrides them."));

// Uniwind reads global.css itself, so its tokens are a generated block inside that file rather than an import.
const MOBILE = "apps/mobile/global.css";
const mobile = normalize(await readFile(path.join(root, MOBILE), "utf8"));
const start = mobile.indexOf(MOBILE_START);
const end = mobile.indexOf(MOBILE_END);
if (start < 0 || end < start || mobile.indexOf(MOBILE_START, start + 1) >= 0) {
	problems.push(`${MOBILE} needs exactly one generated block, from "${MOBILE_START}" to "${MOBILE_END}"`);
} else {
	await sync(MOBILE, mobile.slice(0, start) + mobileTokens() + mobile.slice(end + MOBILE_END.length));
}

if (problems.length) {
	console.error(`Theme tokens are out of date. Run \`pnpm run theme:sync-tokens\`:\n- ${problems.join("\n- ")}`);
	process.exit(1);
}
console.log(check ? "Theme tokens are up to date." : "Theme tokens written.");
