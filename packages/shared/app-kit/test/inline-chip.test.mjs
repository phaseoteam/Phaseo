// The inline chip is one design drawn by every app from ui-recipes/inline-chip.ts. Tailwind and Uniwind only
// generate classes they find written out, so each platform component spells out the variant classes it adds
// (hover, icon colour). These checks fail when a component drifts from the recipe.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { INLINE_CHIP_ACCENT_NAMES, INLINE_CHIP_ACCENTS, INLINE_CHIP_EMBEDDED, INLINE_CHIP_TONE_NAMES, INLINE_CHIP_TONES } from "../src/ui-recipes/inline-chip.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("the recipe keeps the desktop composer's chip", () => {
	assert.deepEqual(INLINE_CHIP_TONES.default, {
		surface: "rounded-md bg-foreground/8 px-1.5",
		text: "font-medium text-foreground/90",
		icon: "text-muted-foreground",
		pressed: "bg-foreground/14",
	});
});

test("the web and desktop chip spells out each tone's icon and hover classes", () => {
	const source = read("packages/shared/ui/src/inline-chip.tsx");
	for (const tone of INLINE_CHIP_TONE_NAMES) {
		const { icon, pressed } = INLINE_CHIP_TONES[tone];
		assert.ok(source.includes(`"[&_svg]:${icon}"`), `inline-chip.tsx needs "[&_svg]:${icon}" for ${tone}`);
		assert.ok(source.includes(`"hover:${pressed}"`), `inline-chip.tsx needs "hover:${pressed}" for ${tone}`);
	}
});

test("desktop draws chips with the shared component", () => {
	assert.match(read("apps/desktop/src/renderer/components/InlineChip.tsx"), /from "@phaseo\/ui\/inline-chip"/);
});

test("the mobile chip takes its classes from the recipe", () => {
	const source = read("apps/mobile/src/components/ui/inline-chip.tsx");
	assert.match(source, /INLINE_CHIP_TONES/);
	for (const tone of INLINE_CHIP_TONE_NAMES) {
		const { pressed } = INLINE_CHIP_TONES[tone];
		assert.ok(source.includes(`"active:${pressed}"`), `mobile inline-chip.tsx needs "active:${pressed}" for ${tone}`);
	}
});

test("the web and desktop chip spells out the embedded variant and each accent", () => {
	const source = read("packages/shared/ui/src/inline-chip.tsx");
	assert.ok(source.includes(`"[&_svg]:${INLINE_CHIP_EMBEDDED.icon}"`), "inline-chip.tsx needs the embedded icon class");
	assert.ok(source.includes(`"hover:${INLINE_CHIP_EMBEDDED.pressed}"`), "inline-chip.tsx needs the embedded hover class");
	for (const accent of INLINE_CHIP_ACCENT_NAMES) {
		const written = INLINE_CHIP_ACCENTS[accent].split(" ").map((name) => name.startsWith("dark:") ? `dark:[&_svg]:${name.slice(5)}` : `[&_svg]:${name}`).join(" ");
		assert.ok(source.includes(`"${written}"`), `inline-chip.tsx needs "${written}" for ${accent}`);
	}
});
