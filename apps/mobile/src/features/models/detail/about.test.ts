import { genericLinks } from "./about";

describe("genericLinks", () => {
  it("drops the licence and repeated URLs, ignoring case only in the scheme and host", () => {
    const links = [
      { kind: "weights", url: "https://huggingface.co/Qwen/QwQ-32B" },
      { kind: "provider", url: "HTTPS://HuggingFace.co/Qwen/QwQ-32B" },
      { kind: "license", url: "https://example.com/licence" },
      { kind: "paper", url: "https://arxiv.org/abs/1" },
    ];
    expect(genericLinks(links).map((link) => link.kind)).toEqual(["weights", "paper"]);
  });

  it("keeps links whose paths differ only in case", () => {
    const links = [
      { kind: "website", url: "https://example.com/Model" },
      { kind: "website", url: "https://example.com/model" },
    ];
    expect(genericLinks(links)).toHaveLength(2);
  });
});
