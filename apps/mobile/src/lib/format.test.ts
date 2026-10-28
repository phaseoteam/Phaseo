import { formatBytes, formatUsd, formatUsdAxis, modalityLabel } from "./format";

describe("formatUsd", () => {
  it("uses US money formatting, never US$", () => {
    expect([0, 0.004, 12.5, 1234.5].map((value) => formatUsd(value))).toEqual(["$0.00", "$0.0040", "$12.50", "$1,234.50"]);
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

describe("formatUsdAxis", () => {
  it("keeps axis money short and US-styled", () => {
    expect([0, 0.0025, 0.5, 2.5, 40, 1200, 15000].map(formatUsdAxis)).toEqual(["$0", "$0.0025", "$0.5", "$2.5", "$40", "$1.2K", "$15K"]);
  });
});

describe("formatBytes", () => {
  it("uses binary units with a few significant digits", () => {
    expect([0, 512, 4300, 12.3 * 1024 * 1024, 1.05 * 1024 ** 3].map(formatBytes)).toEqual(["0 B", "512 B", "4.2 KB", "12.3 MB", "1.05 GB"]);
    expect(formatBytes(null)).toBe("—");
  });
});
