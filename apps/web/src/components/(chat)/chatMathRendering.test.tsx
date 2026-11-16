import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { chatMarkdownPlugins, normalizeChatMarkdown } from "./chatMarkdown";

function render(text: string) {
  return renderToStaticMarkup(<Streamdown plugins={chatMarkdownPlugins}>{normalizeChatMarkdown(text)}</Streamdown>);
}

describe("real chat math rendering", () => {
  it("typesets inline fractions and roots, and display equations", () => {
    const html = render(String.raw`Growth $\frac{1590-1240}{1240}$ and $\sqrt{16}$.` + "\n\n$$\nx^2 + y^2 = z^2\n$$");
    expect(html.match(/class="katex"/g)).toHaveLength(3);
    expect(html).toContain('class="mfrac"');
    expect(html).toContain("<msqrt>");
    expect(html).toContain('class="katex-display"');
  });

  it("keeps currency and code literal without losing adjacent math", () => {
    const html = render("Prices $5 and $10. `$x^2$`\n\n```text\n$80%$\n```\n\n$80%$");
    expect(html).toContain("Prices $5 and $10.");
    expect(html).toContain("$x^2$");
    expect(html).toContain("$80%$");
    expect(html.match(/class="katex"/g)).toHaveLength(1);
  });

  it("accepts incomplete streamed math and unsupported LaTeX without crashing", () => {
    expect(() => render(String.raw`Still $\frac{1`)).not.toThrow();
    expect(() => render(String.raw`$\notARealCommand{x}$`)).not.toThrow();
    expect(render("```text\n$80%$")).not.toContain('class="katex"');
  });
});
