import { AUDIO_FORMATS, audioFormat } from "./request";

describe("audioFormat", () => {
  test("MP3 and WAV by type or extension; anything else isn't one of the formats audio routes take", () => {
    expect(audioFormat("audio/mpeg", "a.bin")).toBe("mp3");
    expect(audioFormat("audio/x-wav", "a.bin")).toBe("wav");
    expect(audioFormat("audio/wave", "a.bin")).toBe("wav");
    expect(audioFormat("", "Voice note.MP3")).toBe("mp3");
    for (const [type, name] of [["audio/mp4", "memo.m4a"], ["audio/aac", "memo.aac"], ["audio/ogg", "memo.ogg"]]) expect(AUDIO_FORMATS).not.toContain(audioFormat(type!, name!));
  });
});
