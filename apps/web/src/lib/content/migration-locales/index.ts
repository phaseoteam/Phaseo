import arSAOpenrouter from "./ar-SA/openrouter";
import arSAVercelAiGateway from "./ar-SA/vercel-ai-gateway";
import arSARequesty from "./ar-SA/requesty";
import arSALLMGateway from "./ar-SA/llmgateway";
import deDEOpenrouter from "./de-DE/openrouter";
import deDEVercelAiGateway from "./de-DE/vercel-ai-gateway";
import deDERequesty from "./de-DE/requesty";
import deDELLMGateway from "./de-DE/llmgateway";
import esESOpenrouter from "./es-ES/openrouter";
import esESVercelAiGateway from "./es-ES/vercel-ai-gateway";
import esESRequesty from "./es-ES/requesty";
import esESLLMGateway from "./es-ES/llmgateway";
import frFROpenrouter from "./fr-FR/openrouter";
import frFRVercelAiGateway from "./fr-FR/vercel-ai-gateway";
import frFRRequesty from "./fr-FR/requesty";
import frFRLLMGateway from "./fr-FR/llmgateway";
import hiOpenrouter from "./hi/openrouter";
import hiVercelAiGateway from "./hi/vercel-ai-gateway";
import hiRequesty from "./hi/requesty";
import hiLLMGateway from "./hi/llmgateway";
import jaOpenrouter from "./ja/openrouter";
import jaVercelAiGateway from "./ja/vercel-ai-gateway";
import jaRequesty from "./ja/requesty";
import jaLLMGateway from "./ja/llmgateway";
import ptBROpenrouter from "./pt-BR/openrouter";
import ptBRVercelAiGateway from "./pt-BR/vercel-ai-gateway";
import ptBRRequesty from "./pt-BR/requesty";
import ptBRLLMGateway from "./pt-BR/llmgateway";
import zhHansOpenrouter from "./zh-Hans/openrouter";
import zhHansVercelAiGateway from "./zh-Hans/vercel-ai-gateway";
import zhHansRequesty from "./zh-Hans/requesty";
import zhHansLLMGateway from "./zh-Hans/llmgateway";

const migrationTextTranslations: Record<string, Record<string, Readonly<Record<string, string>>>> = {
  "ar-SA": {
    openrouter: arSAOpenrouter,
    "vercel-ai-gateway": arSAVercelAiGateway,
    requesty: arSARequesty,
    llmgateway: arSALLMGateway,
  },
  "de-DE": {
    openrouter: deDEOpenrouter,
    "vercel-ai-gateway": deDEVercelAiGateway,
    requesty: deDERequesty,
    llmgateway: deDELLMGateway,
  },
  "es-ES": {
    openrouter: esESOpenrouter,
    "vercel-ai-gateway": esESVercelAiGateway,
    requesty: esESRequesty,
    llmgateway: esESLLMGateway,
  },
  "fr-FR": {
    openrouter: frFROpenrouter,
    "vercel-ai-gateway": frFRVercelAiGateway,
    requesty: frFRRequesty,
    llmgateway: frFRLLMGateway,
  },
  hi: {
    openrouter: hiOpenrouter,
    "vercel-ai-gateway": hiVercelAiGateway,
    requesty: hiRequesty,
    llmgateway: hiLLMGateway,
  },
  ja: {
    openrouter: jaOpenrouter,
    "vercel-ai-gateway": jaVercelAiGateway,
    requesty: jaRequesty,
    llmgateway: jaLLMGateway,
  },
  "pt-BR": {
    openrouter: ptBROpenrouter,
    "vercel-ai-gateway": ptBRVercelAiGateway,
    requesty: ptBRRequesty,
    llmgateway: ptBRLLMGateway,
  },
  "zh-Hans": {
    openrouter: zhHansOpenrouter,
    "vercel-ai-gateway": zhHansVercelAiGateway,
    requesty: zhHansRequesty,
    llmgateway: zhHansLLMGateway,
  },
};

export function getMigrationTranslations(
  locale: string,
  slug: string,
): Readonly<Record<string, string>> | undefined {
  return migrationTextTranslations[locale]?.[slug];
}
