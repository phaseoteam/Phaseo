import type { ModelCard } from "@/lib/api/models";
import {
  ART_LABS, FRONTIER_LABS, LABEL_FADE_MS, LABEL_MS, TAP_GAP_MS, TAPS_TO_OPEN, catalogueFact, hasLogo, newestByLab, nextTap, shortVersion, tapLabel, versionDetail,
  type TapRun,
} from "./versionArt";

const NOW = Date.UTC(2026, 9, 20, 12);

function card(id: string, patch: Partial<ModelCard> = {}): ModelCard {
  return {
    model_id: id,
    name: id.split("/")[1],
    organisation_id: id.split("/")[0],
    organisation_name: id.split("/")[0],
    gateway_status: "active",
    gateway_endpoints: ["text.generate"],
    gateway_input_modalities: ["text"],
    gateway_output_modalities: ["text"],
    gateway_features: [],
    gateway_tiers: [],
    gateway_provider_names: [],
    gateway_active_provider_names: [],
    lowest_input_price: 1,
    lowest_output_price: 4,
    lowest_from_price_unit: "1M tokens",
    context_lengths: [128_000],
    primary_timestamp: Date.UTC(2025, 2, 12),
    ...patch,
  } as ModelCard;
}

/** Taps at these times; returns the taps that opened the art (1-based). */
function tapAt(times: number[]) {
  let run: TapRun | null = null;
  const opened: number[] = [];
  times.forEach((time, index) => {
    const next = nextTap(run, time);
    run = next.run;
    if (next.open) opened.push(index + 1);
  });
  return opened;
}

describe("the five quick taps", () => {
  it("opens on the fifth quick tap, and nothing before it", () => {
    expect(TAPS_TO_OPEN).toBe(5);
    expect(tapAt([0, 300, 600, 900, 1200])).toEqual([5]);
    expect(tapAt([0, 300, 600, 900])).toEqual([]);
  });

  it("opens again on every fifth quick tap after that", () => {
    expect(tapAt(Array.from({ length: 15 }, (_, index) => index * 200))).toEqual([5, 10, 15]);
  });

  it("starts the count again after a pause", () => {
    expect(TAP_GAP_MS).toBe(1500);
    expect(tapAt([0, 400, 800, 800 + TAP_GAP_MS + 1, 3000, 3400, 3800])).toEqual([]);
    expect(tapAt([0, 400, 800, 800 + TAP_GAP_MS + 1, 3000, 3400, 3800, 4200])).toEqual([8]);
    // A gap of exactly the limit still counts.
    expect(tapAt([0, TAP_GAP_MS, TAP_GAP_MS * 2, TAP_GAP_MS * 3, TAP_GAP_MS * 4])).toEqual([5]);
  });

  it("only ever counts the run, with no countdown to show", () => {
    expect(nextTap(null, 10)).toEqual({ run: { count: 1, at: 10 }, open: false });
    expect(nextTap({ count: 4, at: 10 }, 20)).toEqual({ run: null, open: true });
  });
});

describe("version labels", () => {
  it("shows the big number as major.minor", () => {
    expect(shortVersion("0.1.0")).toBe("0.1");
    expect(shortVersion("12.4.1-beta.2")).toBe("12.4");
    expect(shortVersion("3")).toBe("3");
    expect(shortVersion("dev")).toBe("dev");
  });

  it("puts the build number after the version, or the commit for older builds", () => {
    expect(versionDetail("0.1.0", { number: 2505, commit: "56dc9386b8" })).toBe("Version 0.1.0 · build 2505");
    expect(versionDetail("0.1.0", { number: null, commit: "56dc9386b8" })).toBe("Version 0.1.0 · 56dc9386b8");
    expect(versionDetail("0.1.0", { number: null, commit: null })).toBe("Version 0.1.0");
  });
});

describe("catalogueFact", () => {
  it("counts the catalogue's models and labs", () => {
    const models = [card("openai/a"), card("openai/b"), card("anthropic/c"), card("openai/a")];
    expect(catalogueFact(models)).toBe("Tracking 3 models from 2 labs");
  });

  it("uses thousands separators and singular words", () => {
    const many = Array.from({ length: 1204 }, (_, index) => card(`lab${index % 98}/model-${index}`));
    expect(catalogueFact(many)).toBe("Tracking 1,204 models from 98 labs");
    expect(catalogueFact([card("openai/a")])).toBe("Tracking 1 model from 1 lab");
  });

  it("counts a model without a lab ID under its lab name", () => {
    expect(catalogueFact([card("x/a", { organisation_id: null, organisation_name: "X" }), card("y/b")])).toBe("Tracking 2 models from 2 labs");
  });

  it("has nothing to say without a catalogue", () => {
    expect(catalogueFact([])).toBeNull();
  });
});

describe("newestByLab", () => {
  it("finds each lab's newest released model, by name", () => {
    const newest = newestByLab([
      card("openai/gpt-5", { name: "GPT-5", primary_timestamp: Date.UTC(2025, 7, 7) }),
      card("openai/gpt-6", { name: "GPT-6", primary_timestamp: Date.UTC(2026, 8, 1) }),
      card("openai/gpt-7", { name: "GPT-7", primary_timestamp: Date.UTC(2027, 0, 1) }),
      card("openai/gpt-6:free", { name: "GPT-6 (free)", primary_timestamp: Date.UTC(2026, 9, 1) }),
      card("anthropic/old", { name: "Old", primary_timestamp: Date.UTC(2026, 9, 1), status: "Retired" }),
      card("anthropic/claude", { name: "Claude", primary_timestamp: Date.UTC(2026, 5, 1) }),
      card("nodate/x", { primary_timestamp: null }),
    ], NOW);
    expect(Object.fromEntries(newest)).toEqual({ openai: "GPT-6", anthropic: "Claude" });
  });
});

describe("tapLabel", () => {
  it("shows a tapped logo's label for LABEL_MS, then it's gone by itself", () => {
    const shown = tapLabel(null, 2, 1000);
    expect(shown).toEqual({ index: 2, until: 1000 + LABEL_MS });
    expect(LABEL_MS).toBe(2500);
    expect(LABEL_FADE_MS).toBeLessThan(LABEL_MS);
  });

  it("moves to another logo when that one is tapped, for a fresh LABEL_MS", () => {
    expect(tapLabel({ index: 2, until: 3500 }, 5, 2000)).toEqual({ index: 5, until: 2000 + LABEL_MS });
  });

  it("hides when the logo it's showing is tapped again", () => {
    expect(tapLabel({ index: 2, until: 3500 }, 2, 2000)).toBeNull();
  });

  it("shows again for a logo whose label has already gone", () => {
    expect(tapLabel({ index: 2, until: 3500 }, 2, 3500)).toEqual({ index: 2, until: 3500 + LABEL_MS });
  });
});

describe("the frontier labs", () => {
  // Snapshot of the catalogue's organisation rows (organisation_id, name).
  const ORGANISATIONS: Record<string, { organisation_id: string; name: string }> = Object.fromEntries([
    ["openai", "OpenAI"], ["anthropic", "Anthropic"], ["google", "Google"], ["meta", "Meta"],
    ["spacex-ai", "SpaceXAI"], ["deepseek", "DeepSeek"], ["mistral", "Mistral"], ["qwen", "Qwen"],
    ["moonshotai", "Moonshot"], ["z-ai", "z.AI"], ["minimax", "MiniMax"], ["bytedance", "ByteDance"],
    ["nvidia", "Nvidia"], ["microsoft", "Microsoft"], ["amazon", "Amazon"], ["xiaomi", "Xiaomi"],
  ].map(([organisation_id, name]) => [organisation_id, { organisation_id, name }]));

  it("are a fixed list, in order", () => {
    expect(FRONTIER_LABS.map((lab) => lab.name)).toEqual([
      "OpenAI", "Anthropic", "Google", "Meta", "SpaceXAI", "DeepSeek", "Mistral", "Qwen",
      "Moonshot", "z.AI", "MiniMax", "ByteDance", "Nvidia", "Microsoft", "Amazon", "Xiaomi",
    ]);
  });

  it("use the catalogue's organisation IDs and names, so a tap finds the newest model", () => {
    for (const lab of FRONTIER_LABS) {
      const organisation = ORGANISATIONS[lab.id];
      expect({ id: organisation?.organisation_id, name: organisation?.name }).toEqual(lab);
    }
    // xAI's models are listed under SpaceXAI.
    expect(FRONTIER_LABS.map((lab) => lab.id)).toContain("spacex-ai");
  });

  it("all have a logo the app can show, so all sixteen float", () => {
    expect(FRONTIER_LABS.every((lab) => hasLogo(lab.id))).toBe(true);
    expect(ART_LABS).toEqual(FRONTIER_LABS);
    // xAI's old IDs resolve to the same logo.
    expect(hasLogo("x-ai")).toBe(true);
    expect(hasLogo("not-a-lab")).toBe(false);
  });
});
