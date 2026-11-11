import { describe, expect, test, vi } from "vitest";
import { Phaseo, toUploadFile } from "../src/index.js";

type Captured = { url: string; contentType: string | null; form?: FormData; json?: Record<string, unknown> };

function clientCapturing(captured: Captured[]) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/models")) {
      return Response.json({ models: [{ model_id: "openai/whisper-1", status: "active" }, { model_id: "mistral/voxtral-mini-transcribe-2", status: "active" }] });
    }
    const request = new Request(url, init);
    const contentType = request.headers.get("content-type");
    const entry: Captured = { url, contentType };
    if (contentType?.startsWith("multipart/form-data")) entry.form = await request.formData();
    else entry.json = await request.json();
    captured.push(entry);
    return Response.json({ text: "hello" });
  }) as unknown as typeof fetch;
  return new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test", fetchImpl });
}

describe("audio uploads", () => {
  test("sends a named file object as multipart with JSON text for object fields", async () => {
    const captured: Captured[] = [];
    const client = clientCapturing(captured);

    await client.generateTranslation({
      model: "openai/whisper-1",
      file: { fileName: "clip.mp3", content: new Uint8Array([73, 68, 51]) },
      temperature: 0.2,
      provider: { order: ["openai"] },
    });

    const [request] = captured;
    expect(request.url).toBe("https://example.test/audio/translations");
    expect(request.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const file = request.form?.get("file") as File;
    expect(file.name).toBe("clip.mp3");
    expect(file.type).toBe("audio/mpeg");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([73, 68, 51]));
    expect(request.form?.get("model")).toBe("openai/whisper-1");
    expect(request.form?.get("temperature")).toBe("0.2");
    expect(request.form?.get("provider")).toBe('{"order":["openai"]}');
  });

  test("accepts a File and keeps its own type", async () => {
    const captured: Captured[] = [];
    const client = clientCapturing(captured);

    await client.generateTranscription({
      model: "openai/whisper-1",
      file: new File(["RIFF"], "meeting.wav", { type: "audio/x-wav" }),
      stream: false,
    });

    const file = captured[0].form?.get("file") as File;
    expect(file.name).toBe("meeting.wav");
    expect(file.type).toBe("audio/x-wav");
    expect(captured[0].form?.get("stream")).toBe("false");
  });

  test("keeps a transcription by URL as JSON", async () => {
    const captured: Captured[] = [];
    const client = clientCapturing(captured);

    await client.generateTranscription({ model: "mistral/voxtral-mini-transcribe-2", file_url: "https://example.com/clip.mp3" });

    expect(captured[0].contentType).toBe("application/json");
    expect(captured[0].json).toMatchObject({ file_url: "https://example.com/clip.mp3" });
  });

  test.each([
    ["a path string", "clip.mp3"],
    ["unnamed bytes", new Uint8Array([1, 2, 3])],
    ["an unnamed blob", new Blob(["x"])],
    ["an empty file name", { fileName: " ", content: new Uint8Array([1]) }],
  ])("rejects %s before sending anything", async (_label, file) => {
    const captured: Captured[] = [];
    const client = clientCapturing(captured);

    await expect(client.generateTranslation({ model: "openai/whisper-1", file })).rejects.toThrow(TypeError);
    expect(captured).toHaveLength(0);
  });

  test("uploadFile accepts the named file object", async () => {
    const captured: Captured[] = [];
    const client = clientCapturing(captured);

    await client.uploadFile({ purpose: "batch", provider: "openai", file: { fileName: "batch.jsonl", content: '{"custom_id":"1"}\n' } });

    expect(captured[0].url).toBe("https://example.test/batches/files?provider=openai");
    const file = captured[0].form?.get("file") as File;
    expect(file.name).toBe("batch.jsonl");
    expect(file.type).toBe("application/jsonl");
  });

  test("toUploadFile names the problem", () => {
    expect(() => toUploadFile("clip.mp3")).toThrow(/File or \{ fileName, content, contentType\? \}, not a string/);
  });
});
