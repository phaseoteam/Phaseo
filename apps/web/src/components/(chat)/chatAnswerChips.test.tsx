import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatAnswerMarkdown } from "./openui/ChatAnswerContent";

function render(text: string) {
  return renderToStaticMarkup(<ChatAnswerMarkdown content={text} />);
}

describe("assistant answer chips", () => {
  it("renders paths, branches, commits and local servers as chips", () => {
    const html = render("Edit apps/web/src/index.ts on feat/web-chips at a1b2c3d, then open http://localhost:3000/chat.");
    expect(html).not.toContain("data-chip");
    expect(html).toContain('title="apps/web/src/index.ts"');
    expect(html).toContain(">index.ts<span class=\"sr-only\">, file</span>");
    expect(html).toContain("feat/web-chips<span class=\"sr-only\">, branch</span>");
    expect(html).toContain("a1b2c3d</span><span class=\"sr-only\">, commit</span>");
    expect(html).toContain('href="http://localhost:3000/chat"');
    expect(html).toContain("localhost:3000/chat<span class=\"sr-only\">, local server</span>");
  });

  it("leaves model names, colours and request IDs as text", () => {
    const html = render("Try anthropic/claude-fable-5.2 with #ff8800 and G-01HZY3K4M5N6P7Q8R9S0T1V2W3.");
    expect(html).not.toContain("sr-only");
  });

  it("keeps written links as links and ignores chip spans with unsafe fields", () => {
    const html = render('[the docs](https://phaseo.app/docs) <span data-chip=\'{"kind":"link","href":"javascript:alert(1)"}\'>x</span>');
    // Streamdown's link-safety button, not a chip.
    expect(html).toMatch(/data-streamdown="link"[^>]*>the docs</);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain(", link");
  });

  it("chips inline code that is a path, and leaves fenced code as code", () => {
    const html = render("Open `src/app.tsx`.\n\n```ts\nimport x from \"./src/app.tsx\";\n```");
    expect(html).toContain('title="src/app.tsx"');
    expect(html.match(/sr-only">, file</g)).toHaveLength(1);
  });
});
