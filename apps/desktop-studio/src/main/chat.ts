import type { ChatMessage, ProviderProfile } from "@shared/types";

interface ProviderResponse {
  model: string;
  content: string;
}

const DESKTOP_IDENTITY_HEADERS: Record<string, string> = {
  "x-title": "AI Stats Desktop",
  "http-referer": "https://ai-stats.phaseo.app/desktop",
  "x-ai-stats-client": "desktop-studio"
};

function extractOpenAiText(payload: any): string {
  const firstChoice = payload?.choices?.[0];
  const content = firstChoice?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        if (entry?.type === "text" && typeof entry.text === "string") {
          return entry.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function toOpenAiMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

async function generateFromOpenAiCompatible(
  provider: ProviderProfile,
  model: string,
  messages: ChatMessage[]
): Promise<ProviderResponse> {
  const baseUrl = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...DESKTOP_IDENTITY_HEADERS
  };

  if (provider.apiKey.trim()) {
    const key = provider.apiKey.trim();
    headers.Authorization = `Bearer ${key}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: toOpenAiMessages(messages),
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider error ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = extractOpenAiText(payload);
  return {
    model: payload?.model ?? model,
    content: content || "The provider returned an empty response."
  };
}

function generateMockResponse(provider: ProviderProfile, model: string, messages: ChatMessage[]): ProviderResponse {
  const prompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return {
    model,
    content: [
      `Mock assistant response from ${provider.name}.`,
      "",
      "To connect a real model, use an OpenAI-compatible provider profile.",
      "",
      `Your latest prompt was:\n${prompt.slice(0, 800)}`
    ].join("\n")
  };
}

export async function generateAssistantReply(
  provider: ProviderProfile,
  model: string,
  messages: ChatMessage[]
): Promise<ProviderResponse> {
  if (provider.kind === "openai-compatible") {
    return generateFromOpenAiCompatible(provider, model, messages);
  }

  return generateMockResponse(provider, model, messages);
}
