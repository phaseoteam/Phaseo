import { formatBytes, formatSeconds, formatSpeed, formatTokenCount, formatTokens, formatUsd, modalityLabel } from "./format";

describe("formatUsd", () => {
  it("uses US money formatting, never US$", () => {
    expect([0, 0.004, 12.5, 1234.5].map((value) => formatUsd(value))).toEqual(["$0.00", "$0.004", "$12.50", "$1,234.50"]);
    expect(formatUsd(-3)).toBe("-$3.00");
  });
});

describe("modalityLabel", () => {
  it("names the modalities the catalogue uses", () => {
    expect(["text", "audio_tts", "audio_stt", "audio_music", "embeddings", "moderations", "image/*"].map(modalityLabel)).toEqual([
      "Text", "Speech", "Transcription", "Music", "Embeddings", "Moderation", "Image",
    ]);
  });

  it("keeps unknown values readable", () => {
    expect(modalityLabel("video_edit")).toBe("Video edit");
  });
});

describe("formatBytes", () => {
  it("uses binary units with a few significant digits", () => {
    expect([0, 512, 4300, 12.3 * 1024 * 1024, 1.05 * 1024 ** 3].map(formatBytes)).toEqual(["0 B", "512 B", "4.2 KB", "12.3 MB", "1.05 GB"]);
    expect(formatBytes(null)).toBe("—");
  });
});

describe("speed, latency and token limits", () => {
  it("reads as the website: tps, seconds, and token limits in full or short", () => {
    expect([45.25, 123.4, null].map(formatSpeed)).toEqual(["45.3 tps", "123 tps", "—"]);
    expect([850, 13_785, undefined].map(formatSeconds)).toEqual(["0.85 s", "13.8 s", "—"]);
    expect(formatTokenCount(131_072)).toBe("131,072 tokens");
    expect([8_192, 131_072, 1_048_576, 0].map(formatTokens)).toEqual(["8K", "131K", "1M", "—"]);
  });
});
