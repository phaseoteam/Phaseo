// Keeps each app's CSS tokens equal to packages/shared/app-kit/src/theme/tokens.ts. Plain Node, no
// dependencies: `node --experimental-strip-types --test` (pnpm --filter @phaseo/app-kit test).
//
// scripts/sync-theme-tokens.mjs writes most of these values. This test also covers what stays
// hand-written (the website's accent blocks, the radius scales, the first-paint script) and fails when
// hand-written CSS declares a generated token again. Every shared token an app declares must hold the
// shared value; differences on purpose are listed per app with the value they hold, so changing one
// fails here until the list is updated too.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mixOklch, readableForegroundForAccent, toHex } from "../src/theme/colour.ts";
import {
	ACCENT_CHART_MIXES,
	DARK_PALETTES,
	DEFAULT_THEME,
	LIGHT_PALETTES,
	PALETTE_TOKENS,
	RADIUS_BASE_PX,
	RADIUS_PX,
	STATUS_COLOURS,
} from "../src/theme/tokens.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const WEB = "apps/web/src/app/globals.css";
const DESKTOP = "apps/desktop/src/renderer/index.css";
const FACTORY = "apps/factory/src/renderer/index.css";
const MOBILE = "apps/mobile/global.css";
// Each app's generated token file, then its hand-written CSS.
const WEB_CSS = ["apps/web/src/app/theme-tokens.generated.css", WEB];
const DESKTOP_CSS = ["apps/desktop/src/renderer/theme-tokens.generated.css", DESKTOP];
const FACTORY_CSS = ["apps/factory/src/renderer/theme-tokens.generated.css", FACTORY];

const read = (file) => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const css = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, "");
const clean = (value) => value?.replace(/\s+/g, " ").trim().toLowerCase();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The custom properties declared directly in every block whose selector is exactly `selector`, across
 * `files`, without the leading `--`. A property declared in more than one of those blocks fails.
 */
function declarations(files, selector) {
	const list = [files].flat();
	const declared = {};
	let blocks = 0;
	for (const file of list) {
		const source = css(file);
		for (const match of source.matchAll(new RegExp(`(?:^|[{};])\\s*${escape(selector)}\\s*\\{`, "g"))) {
			blocks += 1;
			let depth = 0;
			let own = "";
			for (let index = match.index + match[0].length; index < source.length; index += 1) {
				const char = source[index];
				if (char === "{") depth += 1;
				else if (char === "}") {
					if (depth === 0) break;
					depth -= 1;
				} else if (depth === 0) own += char;
			}
			for (const [, name, value] of own.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
				assert.equal(declared[name], undefined, `--${name} is declared twice for "${selector}" in ${list.join(" and ")}`);
				declared[name] = value.trim();
			}
		}
	}
	assert.ok(blocks > 0, `${list.join(" and ")} has no "${selector} {" block`);
	return declared;
}

/**
 * Checks `declared` against `expected`. `exceptions` are tokens that hold a different value on
 * purpose (or until they're settled), with that value; `absent` are tokens the app doesn't declare.
 */
function compare(where, declared, expected, { exceptions = {}, absent = [] } = {}) {
	for (const [token, value] of Object.entries(expected)) {
		const at = `${where} --${token}`;
		if (absent.includes(token)) {
			assert.equal(declared[token], undefined, `${at} is listed as not declared, but it is: take it off the list`);
		} else if (token in exceptions) {
			assert.equal(clean(declared[token]), clean(exceptions[token]), `${at} is ${declared[token]}, not the listed exception ${exceptions[token]}: update the list`);
		} else {
			assert.equal(clean(declared[token]), clean(value), `${at} is ${declared[token]}, but tokens.ts has ${value}`);
		}
	}
}

/** `var(--radius)`, `calc(var(--radius) - 4px)`, `calc(var(--radius) * 1.8)`, `8px` or `0.625rem`, in pixels. */
function radiusPx(value, base) {
	const text = clean(value) ?? "";
	const round = (number) => Math.round(number * 1000) / 1000;
	let found;
	if ((found = /^([\d.]+)px$/.exec(text))) return Number(found[1]);
	if ((found = /^([\d.]+)rem$/.exec(text))) return Number(found[1]) * 16;
	if (text === "var(--radius)") return base;
	if ((found = /^calc\(var\(--radius\) ([+-]) ([\d.]+)px\)$/.exec(text))) return round(found[1] === "+" ? base + Number(found[2]) : base - Number(found[2]));
	if ((found = /^calc\(var\(--radius\) \* ([\d.]+)\)$/.exec(text))) return round(base * Number(found[1]));
	throw new Error(`Can't read the radius ${value}`);
}

function compareRadii(where, declared, base, { absent = [] } = {}) {
	for (const [token, px] of Object.entries(RADIUS_PX)) {
		const at = `${where} --radius-${token}`;
		if (absent.includes(token)) assert.equal(declared[`radius-${token}`], undefined, `${at} is listed as not declared, but it is: take it off the list`);
		else assert.equal(radiusPx(declared[`radius-${token}`], base), px, `${at} is ${declared[`radius-${token}`]}, not ${px}px`);
	}
}

const accent = { light: DEFAULT_THEME.lightAccent, dark: DEFAULT_THEME.darkAccent };
const palette = { light: PALETTE_TOKENS.light.phaseo, dark: PALETTE_TOKENS.dark.phaseo };

/** Primary, ring and charts for the Phaseo theme, worked out as the mobile app does. */
function accentTokens(scheme) {
	const tokens = { primary: accent[scheme], "primary-foreground": readableForegroundForAccent(accent[scheme]), ring: accent[scheme] };
	for (const [token, { mixWith, accentWeight }] of Object.entries(ACCENT_CHART_MIXES)) {
		tokens[token] = accentWeight === 1 ? accent[scheme] : mixOklch(accent[scheme], toHex(palette[scheme][mixWith]), accentWeight);
	}
	return tokens;
}

test("the website's palettes are the shared ones", () => {
	// :root and .dark are the Phaseo palettes. They also hold an older primary, ring and charts
	// (oklch(0.5 0.134 242.749) and so on), which :root:not(.dark) and :root.dark override with the
	// accent, so those aren't compared. sidebar-primary, sidebar-ring and chart-axis-color are the
	// website's own.
	for (const [scheme, selector] of [["light", ":root"], ["dark", ".dark"]]) {
		compare(`${WEB} ${selector}`, declarations(WEB_CSS, selector), { ...palette[scheme], ...STATUS_COLOURS[scheme] }, {
			// destructive-foreground is the mobile app's: the other apps tint destructive buttons instead of filling them.
			absent: ["destructive-foreground"],
		});
	}
	for (const name of LIGHT_PALETTES.filter((name) => name !== "phaseo")) {
		const selector = `:root[data-light-palette="${name}"]:not(.dark)`;
		compare(`${WEB} ${selector}`, declarations(WEB_CSS, selector), PALETTE_TOKENS.light[name]);
	}
	for (const name of DARK_PALETTES.filter((name) => name !== "phaseo")) {
		const selector = `:root.dark[data-dark-palette="${name}"]`;
		compare(`${WEB} ${selector}`, declarations(WEB_CSS, selector), PALETTE_TOKENS.dark[name]);
	}
});

test("the website derives primary, ring and charts from the shared accents", () => {
	for (const [scheme, selector] of [["light", ":root:not(.dark)"], ["dark", ":root.dark"]]) {
		const userAccent = `var(--${scheme}-user-accent, ${accent[scheme]})`;
		const expected = {
			primary: userAccent,
			"primary-foreground": `var(--${scheme}-user-accent-foreground, ${readableForegroundForAccent(accent[scheme])})`,
			ring: userAccent,
		};
		for (const [token, { mixWith, accentWeight }] of Object.entries(ACCENT_CHART_MIXES)) {
			expected[token] = accentWeight === 1 ? userAccent : `color-mix(in oklch, ${userAccent} ${Math.round(accentWeight * 100)}%, var(--${mixWith}))`;
		}
		compare(`${WEB} ${selector}`, declarations(WEB_CSS, selector), expected);
	}
});

test("the website's radius scale is the shared one", () => {
	const base = radiusPx(declarations(WEB_CSS, ":root").radius, 0);
	assert.equal(base, RADIUS_BASE_PX);
	// 3xl and 4xl are the website's own.
	compareRadii(`${WEB} @theme inline`, declarations(WEB, "@theme inline"), base);
});

test("the website's first-paint script knows the shared palettes", () => {
	// RootDocument applies the saved palettes before React loads, from an inline script with its own lists.
	const script = read("apps/web/src/components/layout/RootDocument.tsx");
	const list = (name) => JSON.parse(new RegExp(`${name}=(\\[[^\\]]*\\])`).exec(script)?.[1] ?? "null");
	assert.deepEqual(list("lp"), [...LIGHT_PALETTES]);
	assert.deepEqual(list("dp"), [...DARK_PALETTES]);
});

for (const [app, file, files] of [["desktop app", DESKTOP, DESKTOP_CSS], ["Factory", FACTORY, FACTORY_CSS]]) {
	test(`the ${app}'s tokens are the shared ones`, () => {
		const light = declarations(files, ":root");
		const dark = declarations(files, ".dark");
		// No charts, and no destructive-foreground (see the website's test).
		const own = { absent: ["destructive-foreground", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] };
		compare(`${file} :root`, light, { ...palette.light, ...STATUS_COLOURS.light, ...accentTokens("light") }, own);
		compare(`${file} .dark`, dark, { ...palette.dark, ...STATUS_COLOURS.dark, ...accentTokens("dark") }, own);
		const base = radiusPx(light.radius, 0);
		assert.equal(base, RADIUS_BASE_PX);
		compareRadii(`${file} @theme inline`, declarations(file, "@theme inline"), base);
	});
}

test("the mobile app's tokens are the shared ones", () => {
	// Uniwind wants full --color-* names. The mobile app swaps these at launch for the chosen theme
	// (src/lib/theme/model.ts); its own test covers --color-link, which only it has.
	for (const scheme of ["light", "dark"]) {
		const declared = Object.fromEntries(Object.entries(declarations(MOBILE, `@variant ${scheme}`)).map(([name, value]) => [name.replace(/^color-/, ""), value]));
		compare(`${MOBILE} @variant ${scheme}`, declared, { ...palette[scheme], ...STATUS_COLOURS[scheme], ...accentTokens(scheme) });
	}
	compareRadii(`${MOBILE} @theme`, declarations(MOBILE, "@theme"), RADIUS_BASE_PX);
});
