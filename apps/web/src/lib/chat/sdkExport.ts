export type SdkRequest = { endpoint: string; body: Record<string, unknown>; baseUrl?: string; requestId?: string; status?: number };

const endpoints: Record<string, string> = {
  text: "/responses", playground: "/responses", "chat-completions": "/chat/completions", messages: "/messages",
  image: "/images/generations", video: "/videos", embeddings: "/embeddings", moderation: "/moderations",
  decisions: "/decisions", ocr: "/ocr", rerank: "/rerank",
};
const audio: Record<string, string> = { speech: "/audio/speech", transcription: "/audio/transcriptions", translation: "/audio/translations", music: "/music/generate" };
const methods: Record<string, [string, string]> = {
  "/responses": ["responses.create", "responses.create"], "/chat/completions": ["chat.completions.create", "chat.completions.create"],
  "/messages": ["messages.create", "messages.create"], "/images/generations": ["generateImage", "images.generate"],
  "/videos": ["videos.generateAndWait", "videos.generate_and_wait"], "/music/generate": ["music.generateAndWait", "music.generate_and_wait"],
  "/embeddings": ["generateEmbedding", "embeddings.create"], "/moderations": ["generateModeration", "moderations.create"],
  "/decisions": ["decisions.make", "decisions.create"], "/ocr": ["ocr.create", "ocr.create"], "/rerank": ["rerank.create", "rerank.create"],
  "/audio/speech": ["generateSpeech", "audio.speech.create"], "/audio/transcriptions": ["generateTranscription", "audio.transcriptions.create"],
  "/audio/translations": ["generateTranslation", "audio.translations.create"],
};

export function sdkRequestFromChat(path: string, init: RequestInit): SdkRequest | null {
  if (init.method?.toUpperCase() !== "POST" || typeof init.body !== "string") return null;
  const room = path.replace("/api/chat/", "");
  try {
    const wrapper = JSON.parse(init.body);
    const endpoint = room === "audio" ? audio[wrapper.action] : endpoints[room];
    if (!endpoint || !wrapper.requestBody || typeof wrapper.requestBody !== "object" || Array.isArray(wrapper.requestBody)) return null;
    return { endpoint, body: redactCredentials(wrapper.requestBody) as Record<string, unknown>, ...(typeof wrapper.baseUrl === "string" ? { baseUrl: wrapper.baseUrl } : {}) };
  } catch { return null; }
}

function redactCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCredentials);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /^(api_?key|authorization|access_token|client_secret)$/i.test(key) ? "REPLACE_WITH_YOUR_CREDENTIAL" : redactCredentials(item),
  ]));
  return value;
}

function pythonLiteral(value: unknown, depth = 1): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  const indent = "    ".repeat(depth);
  if (Array.isArray(value)) return value.length ? `[\n${value.map(item => `${indent}    ${pythonLiteral(item, depth + 1)}`).join(",\n")}\n${indent}]` : "[]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? `{\n${entries.map(([key, item]) => `${indent}    ${JSON.stringify(key)}: ${pythonLiteral(item, depth + 1)}`).join(",\n")}\n${indent}}` : "{}";
  }
  return JSON.stringify(value);
}

export function sdkCode(request: SdkRequest, language: "typescript" | "python"): string {
  const method = methods[request.endpoint];
  if (!method) throw new Error("This endpoint has no SDK export");
  const body = JSON.stringify(request.body, null, 2);
  const streaming = request.body.stream === true && ["/responses", "/chat/completions", "/messages"].includes(request.endpoint);
  if (language === "typescript") {
    const config = request.baseUrl ? `, baseUrl: ${JSON.stringify(request.baseUrl)}` : "";
    const streamMethod = { "/responses": "streamResponses", "/chat/completions": "streamChat", "/messages": "streamMessages" }[request.endpoint];
    const call = streaming ? `for await (const event of client.${streamMethod}(${body})) {\n  process.stdout.write(event.text ?? "");\n}`
      : `const result = await client.${method[0]}(${body});\n${request.endpoint === "/audio/speech" ? 'await writeFile("speech.mp3", new Uint8Array(await result.arrayBuffer()));' : "console.log(result);"}`;
    return `// npm install @phaseo/sdk\n// Set PHASEO_API_KEY in your server environment.\nimport { Phaseo } from "@phaseo/sdk";\n${request.endpoint === "/audio/speech" ? 'import { writeFile } from "node:fs/promises";\n' : ""}\nconst client = new Phaseo({ apiKey: process.env.PHASEO_API_KEY${config} });\n\n${call}\n`;
  }
  const config = request.baseUrl ? `base_url=${JSON.stringify(request.baseUrl)}` : "";
  const call = streaming ? `async for event in client.${method[1].replace(/\.create$/, ".stream")}(request):\n            print(event.get("text", ""), end="", flush=True)`
    : `result = await client.${method[1]}(request)\n        ${request.endpoint === "/audio/speech" ? 'Path("speech.mp3").write_bytes(result)' : "print(result)"}`;
  return `# pip install phaseo\n# Set PHASEO_API_KEY in your server environment.\nimport asyncio\n${request.endpoint === "/audio/speech" ? "from pathlib import Path\n" : ""}from phaseo import AsyncPhaseo\n\nasync def main():\n    request = ${pythonLiteral(request.body)}\n    async with AsyncPhaseo(${config}) as client:\n        ${call}\n\nasyncio.run(main())\n`;
}

let lastRequest: SdkRequest | null = null;
const subscribers = new Set<() => void>();
export const sdkExportStore = {
  get: () => lastRequest,
  subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
  set(request: SdkRequest | null) { lastRequest = request; subscribers.forEach(listener => listener()); },
};
