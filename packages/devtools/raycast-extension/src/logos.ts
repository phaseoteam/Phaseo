import { Image } from "@raycast/api";

const PHASEO_ASSET_ORIGIN = "https://phaseo.app";

const LOGO_PATHS: Record<string, { light: string; dark: string }> = {
  ai21: { light: "/logos/ai21_light.svg", dark: "/logos/ai21_dark.svg" },
  alibaba: { light: "/logos/alibaba.svg", dark: "/logos/alibaba.svg" },
  amazon: { light: "/logos/amazon_light.svg", dark: "/logos/amazon_dark.svg" },
  anthropic: {
    light: "/logos/anthropic_light.svg",
    dark: "/logos/anthropic_dark.svg",
  },
  bytedance: { light: "/logos/bytedance.svg", dark: "/logos/bytedance.svg" },
  cohere: { light: "/logos/cohere.svg", dark: "/logos/cohere.svg" },
  deepseek: { light: "/logos/deepseek.svg", dark: "/logos/deepseek.svg" },
  google: { light: "/logos/google.svg", dark: "/logos/google.svg" },
  ibm: { light: "/logos/ibm.svg", dark: "/logos/ibm.svg" },
  kwaipilot: {
    light: "/logos/kwaipilot_light.svg",
    dark: "/logos/kwaipilot_dark.svg",
  },
  meituan: {
    light: "/logos/meituan_light.svg",
    dark: "/logos/meituan_dark.svg",
  },
  meta: { light: "/logos/meta.svg", dark: "/logos/meta.svg" },
  microsoft: { light: "/logos/microsoft.svg", dark: "/logos/microsoft.svg" },
  minimax: { light: "/logos/minimax.svg", dark: "/logos/minimax.svg" },
  mistral: { light: "/logos/mistral.svg", dark: "/logos/mistral.svg" },
  moonshotai: {
    light: "/logos/moonshotai_light.svg",
    dark: "/logos/moonshotai_dark.svg",
  },
  nvidia: { light: "/logos/nvidia.svg", dark: "/logos/nvidia.svg" },
  openai: { light: "/logos/openai_light.svg", dark: "/logos/openai_dark.svg" },
  qwen: { light: "/logos/qwen.svg", dark: "/logos/qwen.svg" },
  "spacex-ai": {
    light: "/logos/spacexai_light.svg",
    dark: "/logos/spacexai_dark.svg",
  },
  xiaomi: { light: "/logos/xiaomi.svg", dark: "/logos/xiaomi.svg" },
  zai: { light: "/logos/zai_light.svg", dark: "/logos/zai_dark.svg" },
};

const LOGO_ALIASES: Record<string, keyof typeof LOGO_PATHS> = {
  "x-ai": "spacex-ai",
  xai: "spacex-ai",
  longcat: "meituan",
  "meituan-longcat": "meituan",
  "z-ai": "zai",
};

export function getOrganisationLogo(
  organisationId: string | null,
): Image.ImageLike | undefined {
  if (!organisationId) return undefined;

  const normalized = organisationId.trim().toLowerCase();
  const logo = LOGO_PATHS[LOGO_ALIASES[normalized] ?? normalized];
  if (!logo) return undefined;

  return {
    source: {
      light: `${PHASEO_ASSET_ORIGIN}${logo.light}`,
      dark: `${PHASEO_ASSET_ORIGIN}${logo.dark}`,
    },
  };
}
