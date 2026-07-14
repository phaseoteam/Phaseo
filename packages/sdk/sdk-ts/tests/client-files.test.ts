import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";
import { PhaseoHttpError } from "../src/runtime/client.js";

describe("Phaseo file content helpers", () => {
  test("downloads file bytes through getFileContent", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/files/file_123/content");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response('{"ok":true}\n', {
        status: 200,
        headers: { "Content-Type": "application/jsonl" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const content = await client.getFileContent("file_123");

    expect(new TextDecoder().decode(content)).toBe('{"ok":true}\n');
  });

  test("uploads batch files through the batches API model surface", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/batches/files?model=llama-3.3-70b-versatile");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer sk_test_123" });
      expect(init?.body).toBeInstanceOf(FormData);
      return new Response(JSON.stringify({
        id: "file_groq_123",
        object: "file",
        purpose: "batch",
        status: "uploaded",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const client = new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test", fetchImpl });
    await expect(client.uploadFile({
      model: "llama-3.3-70b-versatile",
      purpose: "batch",
      file: new Blob(['{"ok":true}\n'], { type: "application/jsonl" }),
    })).resolves.toMatchObject({ id: "file_groq_123", status: "uploaded" });
  });

  test("surfaces HTTP errors from getFileContent", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    await expect(client.getFileContent("file_missing_123")).rejects.toBeInstanceOf(PhaseoHttpError);
  });
});
