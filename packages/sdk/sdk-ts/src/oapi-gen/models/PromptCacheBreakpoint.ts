/**
 * OpenAI cache breakpoint. Caches everything up to and including this block. Sent to OpenAI and Azure OpenAI GPT-5.6 and later and to DeepInfra; Claude routes receive it as cache_control. Only OpenAI receives its ttl.
 */
export interface PromptCacheBreakpoint {
  mode?: "explicit";
  ttl?: string;
  [key: string]: unknown;
}
