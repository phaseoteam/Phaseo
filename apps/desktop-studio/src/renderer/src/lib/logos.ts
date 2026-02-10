import type { ProviderProfile } from "@shared/types";
import { resolveLogo } from "../../../../../web/src/lib/logos/index";

const PROVIDER_HINTS: Array<{ pattern: RegExp; logoId: string }> = [
  { pattern: /openai|api\.openai/i, logoId: "openai" },
  { pattern: /anthropic|claude/i, logoId: "anthropic" },
  { pattern: /google|gemini|vertex/i, logoId: "google" },
  { pattern: /xai|grok/i, logoId: "xai" },
  { pattern: /deepseek/i, logoId: "deepseek" },
  { pattern: /mistral/i, logoId: "mistral" },
  { pattern: /qwen|alibaba/i, logoId: "qwen" },
  { pattern: /minimax/i, logoId: "minimax" },
  { pattern: /groq/i, logoId: "groq" },
  { pattern: /cohere/i, logoId: "cohere" },
  { pattern: /meta|llama/i, logoId: "meta" },
  { pattern: /perplexity/i, logoId: "perplexity" },
  { pattern: /fireworks/i, logoId: "fireworks" },
  { pattern: /together/i, logoId: "together" }
];

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function isAiStatsGateway(provider: ProviderProfile): boolean {
  const candidate = [
    provider.name,
    provider.id,
    provider.baseUrl,
    hostFromUrl(provider.baseUrl)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /ai[\s-]?stats|phaseo/.test(candidate);
}

export function inferProviderLogoId(provider: ProviderProfile): string {
  if (provider.kind === "mock") {
    return "scira";
  }

  const candidate = [
    provider.name,
    provider.id,
    provider.baseUrl,
    hostFromUrl(provider.baseUrl),
    provider.models.join(" ")
  ]
    .filter(Boolean)
    .join(" ");

  for (const hint of PROVIDER_HINTS) {
    if (hint.pattern.test(candidate)) {
      return hint.logoId;
    }
  }

  const fallbackName = normalise(provider.name || provider.id || "openai");
  return fallbackName;
}

export function resolveDesktopLogo(
  provider: ProviderProfile,
  theme: "light" | "dark"
): { src?: string; label: string } {
  if (isAiStatsGateway(provider)) {
    return {
      src: theme === "dark" ? "/logo_dark.svg" : "/logo_light.svg",
      label: "AI Stats"
    };
  }

  const logoId = inferProviderLogoId(provider);
  const resolved = resolveLogo(logoId, {
    variant: "auto",
    theme,
    fallbackToColor: true
  });

  return {
    src: resolved.src,
    label: resolved.label
  };
}
