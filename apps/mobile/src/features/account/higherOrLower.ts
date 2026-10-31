import type { ModelCard } from "@/lib/api/models";
import { contextWindow, isOnPhaseo, isRetired, modelName, organisationName } from "@/lib/catalogue";
import { formatCalendarDate, formatPrice, formatTokens } from "@/lib/format";

/**
 * "Higher or lower", the game inside the version art (long-press the Phaseo mark there, as on Android's version
 * screen). Each round puts two models from the live catalogue side by side and asks which one wins on a figure both
 * have. Everything here is plain data, so the rules can be tested.
 */

export type Contestant = {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  colour: string | null;
  /** Lowest input and output price, US dollars per million tokens. */
  input: number | null;
  output: number | null;
  /** Largest context window, in tokens. */
  context: number | null;
  /** Release time, ms since the epoch. */
  released: number | null;
};

export type QuestionKind = "input" | "context" | "released" | "output";
export type Side = "left" | "right";

/** Each question and whether the higher or the lower figure wins it. */
export const QUESTIONS: Record<QuestionKind, { prompt: string; wins: "higher" | "lower" }> = {
  input: { prompt: "Which has the higher input price?", wins: "higher" },
  context: { prompt: "Which has the bigger context window?", wins: "higher" },
  released: { prompt: "Which was released earlier?", wins: "lower" },
  output: { prompt: "Which has the cheaper output?", wins: "lower" },
};

export const QUESTION_KINDS = Object.keys(QUESTIONS) as QuestionKind[];

const DAY_MS = 86_400_000;
const EARLIEST_RELEASE = Date.UTC(2015, 0, 1);
const positive = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

/**
 * A catalogue model as a contestant, or null when it can't play: only text models Phaseo routes today (not routers,
 * not `:free` listings) and only figures that are real (prices above zero and per million tokens, a context window,
 * a release date that has passed).
 */
export function toContestant(model: ModelCard, now: number): Contestant | null {
  if (!isOnPhaseo(model) || isRetired(model) || model.model_id.endsWith(":free")) return null;
  if (!model.gateway_endpoints.includes("text.generate")) return null;
  const perMillion = !model.lowest_from_price_unit || model.lowest_from_price_unit === "1M tokens";
  const released = positive(model.primary_timestamp);
  const contestant: Contestant = {
    id: model.model_id,
    name: modelName(model),
    orgId: model.organisation_id ?? model.model_id.split("/")[0] ?? model.model_id,
    orgName: organisationName(model),
    colour: model.organisation_colour ?? null,
    input: perMillion ? positive(model.lowest_input_price) : null,
    output: perMillion ? positive(model.lowest_output_price) : null,
    context: positive(contextWindow(model)),
    released: released != null && released >= EARLIEST_RELEASE && released <= now ? released : null,
  };
  return QUESTION_KINDS.some((kind) => contestant[kind] != null) ? contestant : null;
}

export function buildPool(models: ModelCard[], now: number): Contestant[] {
  const seen = new Set<string>();
  const pool: Contestant[] = [];
  for (const model of models) {
    if (seen.has(model.model_id)) continue;
    const contestant = toContestant(model, now);
    if (!contestant) continue;
    seen.add(model.model_id);
    pool.push(contestant);
  }
  return pool;
}

/**
 * The figure a question compares, at the precision people read it: prices to a millionth of a dollar and releases
 * by day (UTC), so models released the same day tie.
 */
function figure(contestant: Contestant, kind: QuestionKind): number | null {
  const value = contestant[kind];
  if (value == null) return null;
  if (kind === "released") return Math.floor(value / DAY_MS);
  if (kind === "input" || kind === "output") return Math.round(value * 1_000_000);
  return value;
}

/** Which side wins a question: null when either model lacks the figure, "tie" when they match. */
export function winner(left: Contestant, right: Contestant, kind: QuestionKind): Side | "tie" | null {
  const a = figure(left, kind);
  const b = figure(right, kind);
  if (a == null || b == null) return null;
  if (a === b) return "tie";
  const leftHigher = a > b;
  return QUESTIONS[kind].wins === "higher" ? (leftHigher ? "left" : "right") : (leftHigher ? "right" : "left");
}

/** The questions a pair can be asked: both have the figure and it differs. */
export function questionsFor(left: Contestant, right: Contestant): QuestionKind[] {
  return QUESTION_KINDS.filter((kind) => {
    const result = winner(left, right, kind);
    return result === "left" || result === "right";
  });
}

export type Round = { kind: QuestionKind; left: Contestant; right: Contestant; answer: Side };

const roundFor = (left: Contestant, right: Contestant, kinds: QuestionKind[], random: () => number): Round => {
  const kind = kinds[Math.floor(random() * kinds.length)] ?? kinds[0]!;
  return { kind, left, right, answer: winner(left, right, kind) as Side };
};

/**
 * A new round: two different models and a question they can settle. Models in `recent` sit out while there are
 * enough others, and the last question is asked again only when nothing else fits. Null when no pair can play.
 */
export function pickRound(pool: Contestant[], { random = Math.random, recent = [], previous = null }: { random?: () => number; recent?: readonly string[]; previous?: QuestionKind | null } = {}): Round | null {
  if (pool.length < 2) return null;
  const resting = new Set(recent);
  const fresh = pool.filter((contestant) => !resting.has(contestant.id));
  const candidates = fresh.length >= 2 ? fresh : pool;
  const choose = (kinds: QuestionKind[]) => {
    const varied = kinds.filter((kind) => kind !== previous);
    return varied.length ? varied : kinds;
  };

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const first = Math.floor(random() * candidates.length);
    const second = Math.floor(random() * (candidates.length - 1));
    const left = candidates[first];
    const right = candidates[second >= first ? second + 1 : second];
    if (!left || !right) continue;
    const kinds = questionsFor(left, right);
    if (kinds.length) return roundFor(left, right, choose(kinds), random);
  }

  // Few valid pairs (a small or patchy catalogue): look at every pair, starting somewhere random.
  const offset = Math.floor(random() * pool.length);
  for (let i = 0; i < pool.length; i += 1) {
    const left = pool[(i + offset) % pool.length]!;
    for (let j = 0; j < pool.length; j += 1) {
      const right = pool[j]!;
      if (right.id === left.id) continue;
      const kinds = questionsFor(left, right);
      if (kinds.length) return roundFor(left, right, choose(kinds), random);
    }
  }
  return null;
}

/** The revealed figure: "$0.14 / 1M", "128K tokens", "12 Mar 2025". */
export function describeFigure(contestant: Contestant, kind: QuestionKind): string {
  const value = contestant[kind];
  if (value == null) return "Unknown";
  if (kind === "context") return `${formatTokens(value)} tokens`;
  if (kind === "released") return formatCalendarDate(value, "—");
  return `${formatPrice(value)} / 1M`;
}

export function shareMessage(streak: number) {
  return `I got a streak of ${streak} on Phaseo's Higher or lower`;
}
