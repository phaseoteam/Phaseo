import { isOpenableMarkdownLink } from "./markdownLinks";

describe("isOpenableMarkdownLink", () => {
  test("allows web and mail links", () => {
    expect(["https://phaseo.app", "http://example.com/a?b=c", "HTTPS://EXAMPLE.COM", " https://example.com", "mailto:hi@example.com"].map(isOpenableMarkdownLink)).toEqual([true, true, true, true, true]);
  });

  test("rejects other schemes and scheme-less links", () => {
    expect(["tel:+15555550100", "sms:+15555550100", "intent://scan#Intent;end", "javascript:alert(1)", "file:///etc/hosts", "phaseo://settings", "exp://127.0.0.1", "/relative", "example.com", "", "https//missing-colon"].map(isOpenableMarkdownLink)).toEqual(Array(11).fill(false));
  });
});
