import type { ModelCard } from "@/lib/api/models";
import {
  buildPool, describeFigure, nextTap, pickRound, QUESTION_KINDS, questionsFor, shareMessage, TAP_GAP_MS, tapMessage, topLabs, toContestant, winner,
  type Contestant,
} from "./higherOrLower";

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

function contestant(id: string, patch: Partial<Contestant> = {}): Contestant {
  return { id, name: id, orgId: "lab", orgName: "Lab", colour: null, input: null, output: null, context: null, released: null, ...patch };
}

/** Repeatable "random" numbers, so failures can be replayed. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("the seven taps", () => {
  it("counts taps that follow each other and starts again after a pause", () => {
    let tap = nextTap(null, 0);
    expect(tap.count).toBe(1);
    tap = nextTap(tap, 800);
    expect(tap.count).toBe(2);
    expect(nextTap(tap, 800 + TAP_GAP_MS + 1).count).toBe(1);
  });

  it("stops counting at seven", () => {
    let tap = nextTap(null, 0);
    for (let i = 1; i < 10; i += 1) tap = nextTap(tap, i * 100);
    expect(tap.count).toBe(7);
  });

  it("counts down from the third tap", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((count) => tapMessage(count))).toEqual([
      null,
      null,
      "4 taps away from something…",
      "3 taps away from something…",
      "2 taps away from something…",
      "1 tap away from something…",
      null,
    ]);
  });

  it("counts down to a replay once unlocked", () => {
    expect([2, 3, 6, 7].map((count) => tapMessage(count, true))).toEqual([null, "4 taps to the logo burst", "1 tap to the logo burst", null]);
  });
});

describe("toContestant", () => {
  it("takes a routable text model's figures", () => {
    expect(toContestant(card("openai/gpt-5", { name: "GPT-5", organisation_name: "OpenAI" }), NOW)).toEqual({
      id: "openai/gpt-5", name: "GPT-5", orgId: "openai", orgName: "OpenAI", colour: null,
      input: 1, output: 4, context: 128_000, released: Date.UTC(2025, 2, 12),
    });
  });

  it("leaves out models Phaseo doesn't route, routers, free listings and retired models", () => {
    expect(toContestant(card("a/coming", { gateway_status: "coming_soon" }), NOW)).toBeNull();
    expect(toContestant(card("a/off", { gateway_status: "not_active" }), NOW)).toBeNull();
    expect(toContestant(card("phaseo/free", { gateway_endpoints: ["chat/completions"] }), NOW)).toBeNull();
    expect(toContestant(card("a/image", { gateway_endpoints: ["images.generate"] }), NOW)).toBeNull();
    expect(toContestant(card("a/model:free"), NOW)).toBeNull();
    expect(toContestant(card("a/old", { status: "Retired" }), NOW)).toBeNull();
  });

  it("drops figures that aren't real", () => {
    const free = toContestant(card("a/zero", { lowest_input_price: 0, lowest_output_price: 0 }), NOW);
    expect(free).toMatchObject({ input: null, output: null, context: 128_000 });
    const perRequest = toContestant(card("a/request", { lowest_from_price_unit: "request" }), NOW);
    expect(perRequest).toMatchObject({ input: null, output: null });
    const future = toContestant(card("a/future", { primary_timestamp: NOW + 86_400_000 }), NOW);
    expect(future?.released).toBeNull();
    const ancient = toContestant(card("a/ancient", { primary_timestamp: 0 }), NOW);
    expect(ancient?.released).toBeNull();
    const noContext = toContestant(card("a/nocontext", { context_lengths: [] }), NOW);
    expect(noContext?.context).toBeNull();
  });

  it("skips a model with nothing to compare", () => {
    expect(toContestant(card("a/blank", { lowest_input_price: null, lowest_output_price: null, context_lengths: null, primary_timestamp: null }), NOW)).toBeNull();
  });
});

describe("buildPool", () => {
  it("keeps each eligible model once", () => {
    const pool = buildPool([card("a/one"), card("a/one"), card("a/two:free"), card("b/three")], NOW);
    expect(pool.map((entry) => entry.id)).toEqual(["a/one", "b/three"]);
  });
});

describe("winner", () => {
  const cheap = contestant("cheap", { input: 0.14, output: 0.28, context: 64_000, released: Date.UTC(2024, 0, 5) });
  const dear = contestant("dear", { input: 3, output: 15, context: 1_000_000, released: Date.UTC(2025, 5, 1) });

  it("picks the higher figure or the lower one, as the question asks", () => {
    expect(winner(cheap, dear, "input")).toBe("right");
    expect(winner(cheap, dear, "context")).toBe("right");
    expect(winner(cheap, dear, "released")).toBe("left");
    expect(winner(cheap, dear, "output")).toBe("left");
    expect(winner(dear, cheap, "output")).toBe("right");
  });

  it("calls equal figures a tie, at the precision people read them", () => {
    expect(winner(cheap, contestant("same", { input: 0.14 }), "input")).toBe("tie");
    expect(winner(cheap, contestant("float", { input: 0.1 + 0.04 }), "input")).toBe("tie");
    expect(winner(contestant("a", { released: Date.UTC(2025, 1, 3, 1) }), contestant("b", { released: Date.UTC(2025, 1, 3, 23) }), "released")).toBe("tie");
    expect(winner(contestant("a", { context: 128_000 }), contestant("b", { context: 128_000 }), "context")).toBe("tie");
  });

  it("has no answer when either model lacks the figure", () => {
    expect(winner(cheap, contestant("blank"), "input")).toBeNull();
    expect(winner(contestant("blank"), dear, "released")).toBeNull();
  });
});

describe("questionsFor", () => {
  it("offers only questions both models can answer differently", () => {
    const left = contestant("left", { input: 1, output: 2, context: 128_000 });
    const right = contestant("right", { input: 1, output: 3, released: Date.UTC(2025, 0, 1) });
    // Same input price (tie), context and release each missing on one side.
    expect(questionsFor(left, right)).toEqual(["output"]);
  });

  it("offers nothing for a pair that ties or misses everything", () => {
    expect(questionsFor(contestant("a", { input: 2, output: 2 }), contestant("b", { input: 2, output: 2 }))).toEqual([]);
    expect(questionsFor(contestant("a", { input: 2 }), contestant("b", { context: 8_000 }))).toEqual([]);
  });
});

describe("pickRound", () => {
  const pool = buildPool([
    card("openai/gpt-5", { lowest_input_price: 1.25, lowest_output_price: 10, context_lengths: [400_000], primary_timestamp: Date.UTC(2025, 7, 7) }),
    card("anthropic/claude", { lowest_input_price: 3, lowest_output_price: 15, context_lengths: [200_000], primary_timestamp: null }),
    card("google/gemini", { lowest_input_price: 1.25, lowest_output_price: 10, context_lengths: [1_000_000], primary_timestamp: Date.UTC(2025, 5, 17) }),
    card("deepseek/v3", { lowest_input_price: 0.27, lowest_output_price: null, context_lengths: [128_000], primary_timestamp: Date.UTC(2024, 11, 26) }),
    card("meta/llama", { lowest_input_price: null, lowest_output_price: null, context_lengths: [128_000], primary_timestamp: Date.UTC(2024, 11, 26, 18) }),
  ], NOW);

  it("only ever asks questions the pair can settle, with the right answer", () => {
    const random = seeded(7);
    for (let i = 0; i < 500; i += 1) {
      const round = pickRound(pool, { random });
      expect(round).not.toBeNull();
      if (!round) return;
      expect(round.left.id).not.toBe(round.right.id);
      expect(questionsFor(round.left, round.right)).toContain(round.kind);
      expect(winner(round.left, round.right, round.kind)).toBe(round.answer);
    }
  });

  it("asks every kind of question over time", () => {
    const random = seeded(11);
    const kinds = new Set(Array.from({ length: 300 }, () => pickRound(pool, { random })?.kind));
    expect([...kinds].sort()).toEqual([...QUESTION_KINDS].sort());
  });

  it("rests recent models while others can play", () => {
    const random = seeded(3);
    for (let i = 0; i < 100; i += 1) {
      const round = pickRound(pool, { random, recent: ["openai/gpt-5", "google/gemini"] });
      expect([round?.left.id, round?.right.id]).not.toContain("openai/gpt-5");
      expect([round?.left.id, round?.right.id]).not.toContain("google/gemini");
    }
  });

  it("changes the question when the pair allows it", () => {
    const pair = [contestant("a", { input: 1, output: 2 }), contestant("b", { input: 2, output: 3 })];
    const random = seeded(5);
    for (let i = 0; i < 50; i += 1) expect(pickRound(pair, { random, previous: "input" })?.kind).toBe("output");
    // With one question left, it is asked again.
    expect(pickRound([contestant("a", { input: 1 }), contestant("b", { input: 2 })], { random, previous: "input" })?.kind).toBe("input");
  });

  it("finds the one playable pair among many that tie", () => {
    const ties = Array.from({ length: 40 }, (_, index) => contestant(`tie-${index}`, { input: 1 }));
    const odd = contestant("odd", { input: 5 });
    const round = pickRound([...ties, odd], { random: seeded(1) });
    expect(round?.kind).toBe("input");
    expect([round?.left.id, round?.right.id]).toContain("odd");
  });

  it("gives up when no pair can play", () => {
    expect(pickRound([], {})).toBeNull();
    expect(pickRound([contestant("alone", { input: 1 })])).toBeNull();
    expect(pickRound([contestant("a", { input: 1 }), contestant("b", { input: 1 })])).toBeNull();
    expect(pickRound([contestant("a", { input: 1 }), contestant("b", { context: 8_000 })])).toBeNull();
  });
});

describe("describeFigure", () => {
  const model = contestant("m", { input: 0.14, output: 2, context: 128_000, released: Date.UTC(2025, 2, 12) });

  it("shows money in US format per million tokens, and plain tokens and dates", () => {
    expect(describeFigure(model, "input")).toBe("$0.14 / 1M");
    expect(describeFigure(model, "output")).toBe("$2 / 1M");
    expect(describeFigure(model, "context")).toBe("128K tokens");
    expect(describeFigure(model, "released")).toBe("12 Mar 2025");
  });
});

describe("sharing and the celebration", () => {
  it("shares the streak in a plain sentence", () => {
    expect(shareMessage(12)).toBe("I got a streak of 12 on Phaseo's Higher or lower");
  });

  it("celebrates with the labs that have the most models", () => {
    const pool = [contestant("1", { orgId: "qwen", orgName: "Qwen" }), contestant("2", { orgId: "qwen", orgName: "Qwen" }), contestant("3", { orgId: "openai", orgName: "OpenAI" }), contestant("4", { orgId: "anthropic", orgName: "Anthropic" })];
    expect(topLabs(pool, 2).map((lab) => lab.id)).toEqual(["qwen", "anthropic"]);
  });
});
