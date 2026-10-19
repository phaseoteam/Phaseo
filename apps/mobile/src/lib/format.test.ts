import { formatUsd, modalityLabel } from "./format";

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
