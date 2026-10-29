/**
 * Deterministic chat text for the stress dataset: realistic Markdown answers with headings, lists,
 * code blocks and tables, modelled on the desktop app's `ui-preview.mjs --stress` fixture.
 */
export type Random = { next(): number; int(min: number, max: number): number; pick<T>(values: readonly T[]): T; chance(p: number): boolean };

export function random(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (values) => values[Math.floor(next() * values.length)]!,
    chance: (p) => next() < p,
  };
}

const TOPICS = ["Postgres indexes", "React Native lists", "TypeScript generics", "Rust lifetimes", "Kubernetes probes", "SQLite WAL mode", "rate limiting", "OAuth refresh tokens", "CSS grid layouts", "Python async IO", "Go channels", "Terraform state", "Redis eviction", "GraphQL caching", "WebSocket reconnects", "image compression", "unit test fixtures", "feature flags", "CI caching", "accessibility labels"];
const VERBS = ["keeps", "breaks", "speeds up", "slows down", "simplifies", "complicates", "protects", "exposes", "batches", "streams"];
const NOUNS = ["the hot path", "every request", "the cache", "cold starts", "the write path", "memory use", "the main thread", "the query plan", "the retry loop", "error handling", "the build", "the schema"];
const OPENERS = ["In practice,", "The short answer is that", "It depends on the workload, but", "A useful rule of thumb:", "Here is the trade-off:", "The main thing to watch is that", "Most teams find that", "If you measure first,"];
const ADVERBS = ["usually", "rarely", "almost always", "only sometimes", "predictably", "quietly"];
const ASKS = ["How should I structure", "What is the fastest way to handle", "Can you explain", "Why does my setup struggle with", "What are the pitfalls of", "Compare two approaches to", "Give me a checklist for", "Review this plan for"];
const WORDS = ["latency", "throughput", "index", "buffer", "window", "batch", "page", "token", "row", "commit", "snapshot", "cursor", "schema", "column", "query", "worker", "thread", "frame", "layout", "budget"];

export function sentence(r: Random) {
  const topic = r.pick(TOPICS);
  switch (r.int(0, 5)) {
    case 0: return `${r.pick(OPENERS)} ${topic} ${r.pick(ADVERBS)} ${r.pick(VERBS)} ${r.pick(NOUNS)}.`;
    case 1: return `When ${r.pick(NOUNS)} grows past a few thousand ${r.pick(WORDS)}s, ${topic} ${r.pick(VERBS)} ${r.pick(NOUNS)} unless you keep the ${r.pick(WORDS)} small.`;
    case 2: return `Measure the ${r.pick(WORDS)} before and after, because ${topic} ${r.pick(ADVERBS)} ${r.pick(VERBS)} ${r.pick(NOUNS)} in ways that are easy to miss.`;
    case 3: return `A ${r.pick(WORDS)} of ${r.int(2, 512)} ${r.pick(WORDS)}s is a sensible default; going higher ${r.pick(VERBS)} ${r.pick(NOUNS)}.`;
    case 4: return `The \`${r.pick(WORDS)}_${r.pick(WORDS)}\` setting controls how ${topic} treats ${r.pick(NOUNS)}, so check it first.`;
    default: return `**${topic}** ${r.pick(ADVERBS)} ${r.pick(VERBS)} ${r.pick(NOUNS)}, and that is ${r.chance(0.5) ? "fine" : "worth fixing"} for most apps.`;
  }
}

export function paragraph(r: Random, sentences = r.int(2, 5)) {
  return Array.from({ length: sentences }, () => sentence(r)).join(" ");
}

const ident = (r: Random) => `${r.pick(WORDS)}${r.pick(WORDS).replace(/^./, (c) => c.toUpperCase())}`;

export function codeBlock(r: Random, lines = r.int(8, 30)) {
  const language = r.pick(["ts", "python", "sql", "bash", "go"] as const);
  const body: string[] = [];
  for (let index = 0; index < lines; index += 1) {
    const name = ident(r);
    switch (language) {
      case "ts": body.push(r.chance(0.2) ? `export function ${name}(input: ${r.pick(["string", "number", "Row[]", "Options"])}) {` : r.chance(0.15) ? "}" : `  const ${name} = await ${ident(r)}(${r.int(0, 99)}, "${r.pick(WORDS)}");`); break;
      case "python": body.push(r.chance(0.2) ? `def ${name}(self, ${r.pick(WORDS)}: int) -> list[str]:` : `    ${name} = [${r.pick(WORDS)} for ${r.pick(WORDS)} in range(${r.int(1, 64)})]`); break;
      case "sql": body.push(r.chance(0.3) ? `SELECT ${r.pick(WORDS)}, count(*) FROM ${r.pick(WORDS)}s` : `  WHERE ${r.pick(WORDS)}_id = $${r.int(1, 9)} AND ${r.pick(WORDS)} > now() - interval '${r.int(1, 30)} days'`); break;
      case "bash": body.push(`${r.pick(["pnpm", "git", "docker", "kubectl", "curl -s"])} ${r.pick(["run", "exec", "logs", "status", "apply"])} ${r.pick(WORDS)}-${r.pick(WORDS)} --${r.pick(WORDS)}=${r.int(1, 9)}`); break;
      default: body.push(r.chance(0.2) ? `func ${name}(ctx context.Context, n int) error {` : `\t${name} := make(chan ${r.pick(["int", "string", "error"])}, ${r.int(1, 64)})`);
    }
  }
  return `\`\`\`${language}\n${body.join("\n")}\n\`\`\``;
}

export function list(r: Random, items = r.int(3, 6)) {
  const ordered = r.chance(0.3);
  return Array.from({ length: items }, (_, index) => `${ordered ? `${index + 1}.` : "-"} ${sentence(r)}`).join("\n");
}

export function table(r: Random, rows = r.int(3, 8)) {
  const head = `| ${["Option", "Latency", "Memory", "Notes"].join(" | ")} |\n| --- | ---: | ---: | --- |`;
  const body = Array.from({ length: rows }, (_, index) => `| \`${ident(r)}-${index + 1}\` | ${r.int(1, 900)} ms | ${r.int(1, 512)} MB | ${r.pick(NOUNS)} ${r.pick(VERBS)} ${r.pick(NOUNS)} |`);
  return `${head}\n${body.join("\n")}`;
}

/** A typical answer: 1–3 KB of Markdown. */
export function answer(r: Random) {
  const blocks = [paragraph(r)];
  for (let section = 0, sections = r.int(1, 3); section < sections; section += 1) {
    if (r.chance(0.5)) blocks.push(`### ${r.pick(["Why it happens", "What to change", "A worked example", "Trade-offs", "Checklist", "Measuring it"])}`);
    blocks.push(paragraph(r, r.int(1, 3)));
    const kind = r.next();
    blocks.push(kind < 0.55 ? codeBlock(r) : kind < 0.9 ? list(r) : table(r));
  }
  blocks.push(paragraph(r, r.int(1, 2)));
  return blocks.join("\n\n");
}

export function question(r: Random) {
  const ask = `${r.pick(ASKS)} ${r.pick(TOPICS)} when ${r.pick(NOUNS)} ${r.pick(VERBS)} ${r.pick(NOUNS)}?`;
  const extra = r.chance(0.5) ? ` ${sentence(r)}` : "";
  return r.chance(0.1) ? `${ask}${extra}\n\n${codeBlock(r, r.int(4, 10))}` : `${ask}${extra}`;
}

export function reasoning(r: Random) {
  return Array.from({ length: r.int(2, 5) }, () => `The user wants to know about ${r.pick(TOPICS)}. ${sentence(r)} I should mention ${r.pick(NOUNS)} and give an example.`).join("\n\n");
}

/** One very long answer (about `bytes` of Markdown): long code blocks, prose and a table of `tableRows` rows. */
export function hugeAnswer(r: Random, bytes = 400 * 1024, tableRows = 900) {
  const blocks: string[] = ["# Full migration report", paragraph(r, 6)];
  let size = 0;
  const push = (block: string) => { blocks.push(block); size += block.length + 2; };
  push(`## Results table\n\n${paragraph(r, 2)}`);
  push(table(r, tableRows));
  let part = 1;
  while (size < bytes) {
    push(`## Part ${part}: ${r.pick(TOPICS)}`);
    push(paragraph(r, r.int(4, 8)));
    push(codeBlock(r, r.int(120, 220)));
    push(list(r, r.int(4, 8)));
    part += 1;
  }
  return blocks.join("\n\n");
}
