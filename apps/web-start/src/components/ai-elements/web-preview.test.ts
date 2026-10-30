import { normalizeWebPreviewUrl } from "./web-preview";

describe("normalizeWebPreviewUrl", () => {
  it("allows absolute HTTP(S) URLs", () => {
    expect(normalizeWebPreviewUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(normalizeWebPreviewUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects script, data, and relative URLs", () => {
    expect(normalizeWebPreviewUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeWebPreviewUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(normalizeWebPreviewUrl("/same-origin-page")).toBeUndefined();
  });
});
