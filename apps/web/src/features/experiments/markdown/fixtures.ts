/** Chat answers that exercise the Markdown renderers: typical replies, edge cases and hostile input. */
const fence = "```";

const codeReview = `## Review of \`apps/web/src/lib/auth/authOrigin.ts:42\`

The callback host comes from \`VERCEL_URL\`, so preview sign-ins land on the **per-deployment** host instead of the branch alias. See https://phaseo.app/docs/auth and the branch fix/auth-origin-20261013 (commit 7662e93590).

### What changes

1. Read the alias from \`VERCEL_BRANCH_URL\` first.
2. Fall back to \`VERCEL_URL\` only when the alias is missing.
3. Keep production on \`phaseo.app\`.

${fence}ts
export function authOrigin(env: Record<string, string | undefined>): string {
	const alias = env.VERCEL_BRANCH_URL ?? env.VERCEL_URL;
	if (env.VERCEL_ENV === "production") return "https://phaseo.app";
	return alias ? \`https://\${alias}\` : "http://localhost:3100";
}
${fence}

| Environment | Before | After |
| --- | --- | --- |
| Production | \`phaseo.app\` | \`phaseo.app\` |
| Preview | deployment hash | **branch alias** |
| Local | \`localhost:3100\` | \`localhost:3100\` |

> [!WARNING]
> Supabase's redirect allow-list must include the alias pattern, or sign-in still fails.

- [x] Unit test for each environment
- [ ] Check the Supabase allow-list

Run it locally at http://localhost:3100/auth and open \`apps/web/src/lib/auth/\` for the rest.
`;

const maths = `The growth rate is $\\frac{1590-1240}{1240} \\approx 28.2\\%$, and prices went from $5 to $10.

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

A matrix and cases:

$$
A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}, \\quad f(x) = \\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}
$$

Inline sums $\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$ and roots $\\sqrt[3]{27} = 3$. Code stays literal: \`$x^2$\`.

$$
\\begin{aligned}
f(x) &= \\int_0^x t^2 \\, dt \\\\
     &= \\frac{x^3}{3}
\\end{aligned}
$$
`;

const mermaid = `Here is the request flow:

${fence}mermaid
flowchart LR
    Client -->|POST /v1/chat| Gateway
    Gateway --> Router{Pick provider}
    Router -->|healthy| OpenAI
    Router -->|fallback| Anthropic
    OpenAI --> Gateway
    Anthropic --> Gateway
    Gateway --> Client
${fence}

And a sequence:

${fence}mermaid
sequenceDiagram
    participant U as User
    participant G as Gateway
    participant P as Provider
    U->>G: request
    G->>P: forward
    P-->>G: stream
    G-->>U: stream
${fence}
`;

const languages = ["python", "rust", "go", "sql", "bash", "json", "yaml", "tsx", "css", "diff"];
const polyglot = languages.map((language) => `### ${language}\n\n${fence}${language}\n${{
	python: "def fib(n: int) -> int:\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n",
	rust: "fn main() {\n    let v: Vec<u32> = (1..=10).map(|x| x * x).collect();\n    println!(\"{:?}\", v);\n}\n",
	go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hello\")\n}\n",
	sql: "SELECT model_id, count(*) AS requests\nFROM gateway_requests\nWHERE created_at > now() - interval '1 day'\nGROUP BY 1 ORDER BY 2 DESC LIMIT 10;\n",
	bash: "pnpm --filter @phaseo/web dev &\ncurl -s localhost:3100/api/health | jq .\n",
	json: "{\n  \"model\": \"gpt-6.2-astra\",\n  \"stream\": true,\n  \"messages\": [{ \"role\": \"user\", \"content\": \"hi\" }]\n}\n",
	yaml: "name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
	tsx: "export function Hello({ name }: { name: string }) {\n  return <p className=\"text-sm\">Hello {name}</p>;\n}\n",
	css: ".card {\n  border-radius: 0.375rem;\n  color: oklch(0.6 0.1 250);\n}\n",
	diff: "- const x = 1;\n+ const x = 2;\n  const y = 3;\n",
}[language]}${fence}`).join("\n\n");

const edgeCases = `# Edge cases

Footnote reference[^1] and a reference link [docs][d].

[d]: https://phaseo.app/docs
[^1]: The footnote text.

~~Struck~~ *emphasis* __strong__ ***both*** and a hard\\
break. CJK: これは**強調**です。

1. One
   - nested **bold**
     1. deeper \`code\`
2. Two

<details>
<summary>Raw HTML details</summary>

Hidden content.

</details>

Escaped \\*stars\\* and an email person@example.com and a version 1.2.3.

Very long word: Supercalifragilisticexpialidocious_and_a_very_long_identifier_without_any_breaks_whatsoever_that_should_wrap

| a | very | wide | table | with | many | columns | to | test | overflow | handling | here |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |

![An image](https://phaseo.app/og.png)

Emoji 🚀 and RTL text: مرحبا بالعالم.
`;

const hostile = `# Hostile input (nothing here should run)

<script>window.__mdXss = (window.__mdXss || 0) + 1</script>

<img src=x onerror="window.__mdXss = (window.__mdXss || 0) + 1">

<svg onload="window.__mdXss = (window.__mdXss || 0) + 1"></svg>

<iframe src="https://example.com"></iframe>

<a href="javascript:window.__mdXss=(window.__mdXss||0)+1">raw html javascript link</a>

[markdown javascript link](javascript:window.__mdXss=(window.__mdXss||0)+1)

[mixed case](JaVaScRiPt:window.__mdXss=(window.__mdXss||0)+1)

[entity](&#106;avascript:window.__mdXss=(window.__mdXss||0)+1)

[data url](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)

[vbscript](vbscript:msgbox(1))

![image javascript](javascript:window.__mdXss=(window.__mdXss||0)+1)

[title breakout](https://example.com "t\\" onmouseover=\\"window.__mdXss=1")

<style>body { display: none !important; }</style>

<form action="https://example.com"><input name="password"><button>Log in</button></form>

$\\href{javascript:alert(1)}{click}$

${fence}html
<script>alert("this is code, it must show as text")</script>
${fence}

Chip forgery: <span data-chip='{"kind":"link","href":"javascript:alert(1)"}'>x</span>

[fake chip](phaseo-chip:link:%7B%22kind%22%3A%22link%22%2C%22href%22%3A%22javascript%3Aalert(1)%22%7D)
`;

function longAnswer() {
	const parts: string[] = [];
	for (let section = 1; section <= 24; section++) {
		parts.push(`## Section ${section}: provider routing notes\n\nThe gateway picked **provider ${section}** because its p50 latency was ${200 + section * 7} ms and its error rate was ${(section % 5) / 10}%. See \`apps/api/src/routing/score.ts:${section * 10}\` and https://phaseo.app/models.\n\n- Throughput: ${100 + section} tok/s\n- Cost: $${(section * 0.13).toFixed(2)} per 1M tokens\n- Region: \`eu-west-${section % 3}\`\n\n${fence}ts\nconst score${section} = latency * ${section} + errors * ${section * 2};\nif (score${section} > threshold) fallback("provider-${section}");\n${fence}\n\n| Metric | Value |\n| --- | --- |\n| p50 | ${200 + section} ms |\n| p99 | ${900 + section * 3} ms |\n\nInline math $x_${section} = \\frac{${section}}{2}$ keeps working.\n`);
	}
	return parts.join("\n");
}

/** Every chip kind, in prose, lists, a table, an alert and `<details>`, beside code that must stay text. */
const chips = `Here's what changed on \`feat/web-chips\` at commit a1b2c3d4e5:

- Edited apps/web/src/components/markdown/words/WordsMarkdown.tsx:42
- Moved the helpers into packages/shared/app-kit/src/
- New test: \`apps/web/src/components/markdown/words/wordsChatChips.client.test.tsx\`
- Branch fix/desktop-pr-links-20261122 is pushed
- Earlier discussion: @[Words rollout plan](chat:demo-words-plan)

Docs are at https://phaseo.app/docs and the dev server is on http://localhost:3100/experiments/markdown.

| File | Change |
| --- | --- |
| apps/desktop/src/renderer/components/WordsMessageContent.tsx | Video hook |
| packages/shared/app-kit/src/messageChipsMarkdown.ts | Links option |

> [!NOTE]
> The chip in this note, apps/web/src/index.ts, renders too.

<details>
<summary>Full file list</summary>

- apps/web/src/components/ai-elements/message.tsx
- Branch spike/pierre-words-20261118 at 01b131107d

</details>

Code stays literal:

${fence}ts
import { WordsMarkdown } from "apps/web/src/components/markdown/words/WordsMarkdown";
${fence}
`;

export const markdownFixtures = {
	chips,
	codeReview,
	maths,
	mermaid,
	polyglot,
	edgeCases,
	hostile,
	long: longAnswer(),
} as const;

export type MarkdownFixture = keyof typeof markdownFixtures;
