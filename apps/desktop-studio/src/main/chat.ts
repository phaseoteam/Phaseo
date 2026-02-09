import type { ChatMessage } from "@shared/types";
import type { AppSettings } from "@shared/types";

interface ProviderResponse {
  model: string;
  content: string;
}

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
  settings: AppSettings,
  messages: ChatMessage[]
): Promise<ProviderResponse> {
  if (!settings.openAiApiKey.trim()) {
    return {
      model: settings.openAiModel,
      content:
        "No API key configured. Add an API key in Settings and set provider to openai-compatible to use hosted models."
    };
  }

  const baseUrl = settings.openAiBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openAiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openAiModel,
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
    model: payload?.model ?? settings.openAiModel,
    content: content || "The provider returned an empty response."
  };
}

function generateMockResponse(messages: ChatMessage[]): ProviderResponse {
  const prompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return {
    model: "mock-local-model",
    content: [
      "Mock assistant response (local mode).",
      "",
      "To connect a real model, switch provider to openai-compatible and configure base URL, key, and model.",
      "",
      `Your latest prompt was:\n${prompt.slice(0, 800)}`
    ].join("\n")
  };
}

export async function generateAssistantReply(
  settings: AppSettings,
  messages: ChatMessage[]
): Promise<ProviderResponse> {
  if (settings.provider === "openai-compatible") {
    return generateFromOpenAiCompatible(settings, messages);
  }

  return generateMockResponse(messages);
}
