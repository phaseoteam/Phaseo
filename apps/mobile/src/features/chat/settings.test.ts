import { buildRequestBody, loggableRequest } from "./request";
import { changedSettingsCount, cleanSettings, normaliseNumberSetting, settingsRequestFields, sharedSettings, systemPromptFor } from "./settings";

const routes = {
  providerIds: ["openai", "azure"],
  reasoning: { supportedValues: ["low" as const, "medium" as const, "high" as const], defaultValue: "medium" as const },
  serviceTiers: { supportedValues: ["standard" as const, "priority" as const, "flex" as const] },
};

describe("settings to the chat-completions request", () => {
  test("unset settings add nothing", () => {
    expect(settingsRequestFields(undefined)).toEqual({});
    expect(settingsRequestFields({})).toEqual({});
    expect(settingsRequestFields({ temperature: null, maxOutputTokens: null, topP: null, topK: null, minP: null, topA: null, providerId: "auto", serviceTier: "standard", reasoningEnabled: false, systemPrompt: "  " }, routes)).toEqual({});
  });

  test("each sampling field goes by the gateway's chat-completions name", () => {
    expect(settingsRequestFields({ temperature: 0.2 })).toEqual({ temperature: 0.2 });
    // max_tokens is the canonical name; max_output_tokens and max_completion_tokens are aliases of it.
    expect(settingsRequestFields({ maxOutputTokens: 64 })).toEqual({ max_tokens: 64 });
    expect(settingsRequestFields({ topP: 0.9 })).toEqual({ top_p: 0.9 });
    expect(settingsRequestFields({ topK: 40 })).toEqual({ top_k: 40 });
    expect(settingsRequestFields({ minP: 0.05 })).toEqual({ min_p: 0.05 });
    expect(settingsRequestFields({ topA: 0.1 })).toEqual({ top_a: 0.1 });
  });

  test("numbers are kept to the gateway's ranges and whole where they must be", () => {
    expect(settingsRequestFields({ temperature: 5, topP: -1, topK: 12.6, maxOutputTokens: 0 })).toEqual({ temperature: 2, top_p: 0, top_k: 13, max_tokens: 1 });
    expect(normaliseNumberSetting("temperature", "0,7")).toBe(0.7);
    expect(normaliseNumberSetting("temperature", "abc")).toBeNull();
    expect(normaliseNumberSetting("maxOutputTokens", "")).toBeNull();
  });

  test("a chosen provider becomes provider.only, unless it no longer serves the model", () => {
    expect(settingsRequestFields({ providerId: "azure" }, routes)).toEqual({ provider: { only: ["azure"] } });
    expect(settingsRequestFields({ providerId: "gone" }, routes)).toEqual({});
    // Without route data the choice is sent as saved.
    expect(settingsRequestFields({ providerId: "azure" })).toEqual({ provider: { only: ["azure"] } });
  });

  test("service tier: Standard is left out, a sold tier is sent, an unsold one is dropped", () => {
    expect(settingsRequestFields({ serviceTier: "standard" }, routes)).toEqual({});
    expect(settingsRequestFields({ serviceTier: "priority" }, routes)).toEqual({ service_tier: "priority" });
    expect(settingsRequestFields({ serviceTier: "ultrafast" }, routes)).toEqual({});
    expect(settingsRequestFields({ serviceTier: "flex" })).toEqual({});
  });

  test("reasoning sends the chosen effort when supported, else the gateway default", () => {
    expect(settingsRequestFields({ reasoningEnabled: true, reasoningEffort: "high" }, routes)).toEqual({ reasoning: { effort: "high" } });
    expect(settingsRequestFields({ reasoningEnabled: true, reasoningEffort: "max" }, routes)).toEqual({ reasoning: { effort: "medium" } });
    expect(settingsRequestFields({ reasoningEnabled: true }, routes)).toEqual({ reasoning: { effort: "medium" } });
    expect(settingsRequestFields({ reasoningEnabled: false, reasoningEffort: "high" }, routes)).toEqual({});
  });

  test("the system prompt goes first in the messages, and the rest of the body is unchanged", () => {
    const body = buildRequestBody({ model: "phaseo/free", messages: [{ role: "user", content: "Hi" }], settings: { systemPrompt: " Answer in French. ", temperature: 0.2, maxOutputTokens: 64 } });
    expect(body).toEqual({
      model: "phaseo/free",
      messages: [{ role: "system", content: "Answer in French." }, { role: "user", content: "Hi" }],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2,
      max_tokens: 64,
    });
    expect(buildRequestBody({ model: "m", messages: [{ role: "user", content: "Hi" }] }).messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(systemPromptFor({ systemPrompt: "" })).toBeNull();
  });

  test("the debug log shortens message text and leaves out attachment data", () => {
    const body = buildRequestBody({ model: "m", messages: [{ role: "user", content: [{ type: "text", text: "x".repeat(400) }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] }] });
    const logged = loggableRequest(body);
    expect(JSON.stringify(logged)).not.toContain("base64");
    expect(JSON.stringify(logged)).toContain("…");
  });
});

describe("stored settings", () => {
  test("defaults are stored as nothing, and only real changes count", () => {
    expect(cleanSettings({ providerId: "auto", serviceTier: "standard", reasoningEnabled: false, displayName: " ", temperature: null })).toEqual({});
    expect(changedSettingsCount({ displayName: "Mine", reasoningEffort: "high" })).toBe(0);
    expect(changedSettingsCount({ reasoningEnabled: true, reasoningEffort: "high", temperature: 0.2 })).toBe(2);
  });

  test("apply to all copies everything except the provider and the display name", () => {
    expect(sharedSettings({ providerId: "azure", displayName: "Mine", temperature: 0.3, systemPrompt: "Be brief" })).toEqual({ temperature: 0.3, systemPrompt: "Be brief" });
  });
});
