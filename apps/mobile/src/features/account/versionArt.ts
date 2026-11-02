import type { ModelCard } from "@/lib/api/models";
import { isRetired, modelName, organisationName } from "@/lib/catalogue";
import { formatNumber } from "@/lib/format";
// The web's logo resolver is plain data and functions (the Logo component uses it too).
import { resolveLogo } from "@phaseo/app-kit/logos";

/**
 * The version art, Phaseo's take on Android's version easter egg: five quick taps on Account → Version and build
 * open a full screen of the version and the labs' logos, and a long press on the Phaseo mark there opens Higher or
 * lower. Everything here is plain data, so it can be tested; the floating maths is in floating.ts.
 */

export const TAPS_TO_OPEN = 5;
/** Each tap has to follow the last within this, as on Android. */
export const TAP_GAP_MS = 1500;

export type TapRun = { count: number; at: number };

/**
 * The run of taps after one more: it counts taps that follow each other quickly and opens on the fifth, then starts
 * again, so the art opens every time. Nothing is shown along the way.
 */
export function nextTap(run: TapRun | null, now: number): { run: TapRun | null; open: boolean } {
  const count = run && now - run.at <= TAP_GAP_MS ? run.count + 1 : 1;
  if (count >= TAPS_TO_OPEN) return { run: null, open: true };
  return { run: { count, at: now }, open: false };
}

/** The big number: "0.1" from "0.1.0", "12" from "12". */
export function shortVersion(version: string) {
  const parts = version.split(/[.+-]/).filter((part) => /^\d+$/.test(part));
  return parts.length ? parts.slice(0, 2).join(".") : version;
}

/** "Version 0.1.0 · build 2505"; older builds show their commit instead, and builds with neither just the version. */
export function versionDetail(version: string, build: { number: number | null; commit: string | null }) {
  const detail = build.number != null ? `build ${build.number}` : build.commit;
  return detail ? `Version ${version} · ${detail}` : `Version ${version}`;
}

const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

/** The line under the version: "Tracking 1,204 models from 98 labs". Null when the catalogue has no models. */
export function catalogueFact(models: ModelCard[]): string | null {
  const ids = new Set<string>();
  const labs = new Set<string>();
  for (const model of models) {
    ids.add(model.model_id);
    labs.add(model.organisation_id ?? organisationName(model));
  }
  if (!ids.size) return null;
  return `Tracking ${plural(ids.size, "model", "models")} from ${plural(labs.size, "lab", "labs")}`;
}

/** A lab whose logo floats in the art: its catalogue organisation ID (also its logo's ID) and its name. */
export type ArtLab = { id: string; name: string };

/**
 * The frontier labs, a fixed list in this order. The IDs and names are the catalogue's organisations, so a tapped
 * logo can show the lab's newest model; xAI is listed as SpaceXAI, the catalogue's and the logo's name since the
 * merger.
 */
export const FRONTIER_LABS: readonly ArtLab[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "meta", name: "Meta" },
  { id: "spacex-ai", name: "SpaceXAI" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "mistral", name: "Mistral" },
  { id: "qwen", name: "Qwen" },
  { id: "moonshotai", name: "Moonshot" },
  { id: "z-ai", name: "z.AI" },
  { id: "minimax", name: "MiniMax" },
  { id: "bytedance", name: "ByteDance" },
  { id: "nvidia", name: "Nvidia" },
  { id: "microsoft", name: "Microsoft" },
  { id: "amazon", name: "Amazon" },
  { id: "xiaomi", name: "Xiaomi" },
];

/** Whether the app has a logo for an ID in both themes (the same lookup the Logo component makes). */
export function hasLogo(id: string) {
  return (["light", "dark"] as const).every((theme) => Boolean(resolveLogo(id, { theme, fallbackToColor: true })?.src));
}

/** The labs that float: the frontier labs the app has a logo for, so none shows as a letter. */
export const ART_LABS: readonly ArtLab[] = FRONTIER_LABS.filter((lab) => hasLogo(lab.id));

/** A tapped logo's name and newest model show for this long, the last LABEL_FADE_MS of it fading out. */
export const LABEL_MS = 2500;
export const LABEL_FADE_MS = 300;

/** The label on show: which logo it's for, and when it goes. */
export type Label = { index: number; until: number };

/**
 * The label after a tap on logo `index` at `now`. It shows for LABEL_MS and then goes by itself; a tap on another logo
 * moves it there (for a fresh LABEL_MS), and a tap on the logo it's showing hides it. Nothing stays shown.
 */
export function tapLabel(current: Label | null, index: number, now: number): Label | null {
  if (current && current.index === index && now < current.until) return null;
  return { index, until: now + LABEL_MS };
}

/**
 * Each lab's newest model that has been released, for the line under a tapped logo. Retired models and `:free`
 * listings are left out, so the name is one people can use today.
 */
export function newestByLab(models: ModelCard[], now: number): Map<string, string> {
  const newest = new Map<string, { name: string; at: number }>();
  for (const model of models) {
    const at = model.primary_timestamp;
    const lab = model.organisation_id;
    if (!lab || typeof at !== "number" || !Number.isFinite(at) || at > now) continue;
    if (isRetired(model) || model.model_id.endsWith(":free")) continue;
    const current = newest.get(lab);
    if (!current || at > current.at) newest.set(lab, { name: modelName(model), at });
  }
  return new Map([...newest].map(([lab, { name }]) => [lab, name]));
}
