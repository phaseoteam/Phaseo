import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChatMarkdown } from "../src/markdownMath.ts";

test("math shares the web currency and percentage rules on native", () => {
  assert.equal(normalizeChatMarkdown("Prices $5 and $10; $2 + 2$ = $4$; $80%$."), "Prices \\$5 and \\$10; $2 + 2$ = $4$; $80\\%$.");
  assert.equal(normalizeChatMarkdown("Prices $5 and 80% off $10"), "Prices \\$5 and 80% off \\$10");
  assert.equal(normalizeChatMarkdown("$$x = 80%$$"), "$$\nx = 80\\%\n$$");
  assert.equal(normalizeChatMarkdown(String.raw`$80\%$ and $\frac{1}{2}$`), String.raw`$80\%$ and $\frac{1}{2}$`);
});

test("inline code and closed or streaming fences remain literal", () => {
  for (const code of ["`$80%$`", "``$80%$``", "```ts\n$80%$\n```", "  ~~~text\n$80%$\n  ~~~", "```ts\n$80%$\n", "   ```ts\n$80%$"]) {
    assert.equal(normalizeChatMarkdown(code), code);
  }
});

test("an incomplete equation remains readable while streaming", () => {
  assert.equal(normalizeChatMarkdown(String.raw`Growth is $\frac{a`), String.raw`Growth is $\frac{a`);
});

test("display math stays one native Markdown paragraph even with blank lines", () => {
  assert.equal(normalizeChatMarkdown("$$\na=1\n\n\nb=2\n$$"), "$$\na=1\nb=2\n$$");
});
