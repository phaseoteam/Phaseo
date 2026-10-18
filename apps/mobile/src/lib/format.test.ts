import { modalityLabel } from "./format";

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
