-- Replace "X is available through ZenMux's unified model API" placeholder
-- descriptions with a description of the model itself, from the model
-- creator's own documentation or announcement.
--
-- Provider availability belongs on provider routes, not in the description.
-- Rows whose key facts could not be confirmed from a vendor page (ERNIE 5.0
-- Thinking Preview, Doubao-Seed 2.1-pro / 2.1-turbo / Character / Evolving /
-- 2.0-mini / 2.0-code, Grok 4.2 Fast and Fast Non Reasoning) are intentionally
-- left unchanged.

-- Guarded on the description observed during the 2026-10-12 audit, so a newer
-- admin edit is never overwritten. Row-level history is recorded by the
-- catalogue_row_history trigger on public.v2_models.
with fixes (model_slug, old_description, new_description) as (
values
  ($d$baidu/ernie-x1.1-preview$d$::text, $d$ERNIE-X1.1-Preview is available through ZenMux's unified model API.$d$::text, $d$ERNIE-X1.1-Preview is a deep-thinking reasoning model from Baidu for complex reasoning tasks. It is built on the ERNIE 4.5 multimodal foundation model and trained with an iterative hybrid reinforcement learning framework.$d$::text),
  ($d$bytedance/doubao-seed-2.0-pro$d$::text, $d$Doubao-Seed-2.0-pro is available through ZenMux's unified model API.$d$::text, $d$Doubao-Seed-2.0-pro is the Pro tier of ByteDance's Doubao-Seed-2.0 model family, targeting long-chain reasoning and robustness in complex real-world workflows. The Seed2.0 family supports multimodal understanding across image and video inputs.$d$::text),
  ($d$bytedance/doubao-seed-2.0-lite$d$::text, $d$Doubao-Seed-2.0-lite is available through ZenMux's unified model API.$d$::text, $d$Doubao-Seed-2.0-lite is the Lite tier of ByteDance's Doubao-Seed-2.0 model family, balancing output quality and response speed as a production-grade general-purpose model. Its 0428 version adds native omni-modal understanding across video, image, audio and text.$d$::text),
  ($d$bytedance/doubao-seed-1.8$d$::text, $d$Doubao-Seed-1.8 is available through ZenMux's unified model API.$d$::text, $d$Doubao-Seed-1.8 is a generalized agentic model from ByteDance for search, code generation, GUI interaction and multi-step task execution. It handles text, image and video understanding and offers three thinking modes that trade reasoning depth against compute.$d$::text),
  ($d$bytedance/doubao-seed-code$d$::text, $d$Doubao-Seed-Code is available through ZenMux's unified model API.$d$::text, $d$Doubao-Seed-Code is a coding model from ByteDance optimized for agentic programming tasks. It supports a 256K-token context window and native image understanding, so it can work from UI designs and screenshots.$d$::text),
  ($d$inclusionai/llada2.1-flash$d$::text, $d$LLaDA2.1-flash is available through ZenMux's unified model API.$d$::text, $d$LLaDA2.1-flash is a mixture-of-experts diffusion language model from inclusionAI with about 100B non-embedding parameters. It adds error-correcting token editing and offers a Speed Mode and a Quality Mode, with a 32,768-token context length.$d$::text),
  ($d$meta/llama-4-scout-17b-16e-instruct$d$::text, $d$Llama 4 Scout Instruct is available through ZenMux's unified model API.$d$::text, $d$Llama 4 Scout Instruct is an instruction-tuned, natively multimodal mixture-of-experts model from Meta with 17 billion active parameters across 16 experts (109 billion total). It accepts multilingual text and image input and produces text and code, with a 10 million token context length listed by Meta.$d$::text),
  ($d$mistral/mistral-large-2512$d$::text, $d$Mistral Large 3 is available through ZenMux's unified model API.$d$::text, $d$Mistral Large 3 is an open-weight, general-purpose multimodal model from Mistral AI built on a granular mixture-of-experts architecture, with about 675B total and 41B active parameters. It has a 256k-token context window.$d$::text),
  ($d$moonshotai/kimi-k2.7-code-highspeed$d$::text, $d$Kimi K2.7 Code HighSpeed is available through ZenMux's unified model API.$d$::text, $d$Kimi K2.7 Code HighSpeed was a faster-output serving of Kimi K2.7 Code, a coding-focused agentic model from Moonshot AI. Per Moonshot it was the same model with a 256K-token context window and about 180 tokens per second of output speed, accepting text, image and video input.$d$::text),
  ($d$qwen/qwen3-vl-embedding$d$::text, $d$Qwen3 VL Embedding is available through ZenMux's unified model API.$d$::text, $d$Qwen3 VL Embedding is a multimodal embedding model from Qwen for retrieval across text, images, screenshots and video. It maps these inputs into a shared vector space and accepts up to 32,000 tokens of text per input.$d$::text),
  ($d$qwen/qwen3-vl-plus$d$::text, $d$Qwen3-VL-Plus is available through ZenMux's unified model API.$d$::text, $d$Qwen3-VL-Plus is a vision-language model from Qwen for image and video understanding. It has a 262,144-token context window, accepts text, image and video input, and supports both thinking and non-thinking modes.$d$::text),
  ($d$qwen/qwen3-asr-flash$d$::text, $d$Qwen3 ASR Flash is available through ZenMux's unified model API.$d$::text, $d$Qwen3 ASR Flash is a multilingual speech recognition model from Qwen built on a large language model. It takes audio input, outputs text and detects the spoken language automatically.$d$::text),
  ($d$z-ai/glm-4.7-flash-free$d$::text, $d$GLM 4.7 Flash (Free) is available through ZenMux's unified model API.$d$::text, $d$GLM 4.7 Flash was a lightweight 30B-A3B mixture-of-experts model from Z.ai, recommended for coding, agentic work, reasoning and Chinese writing. It had a 200K-token context window and text input and output.$d$::text),
  ($d$z-ai/glm-4.7-flashx$d$::text, $d$GLM 4.7 FlashX is available through ZenMux's unified model API.$d$::text, $d$GLM 4.7 FlashX is the lightweight, high-speed model in Z.ai's GLM-4.7 series. It has a 200K-token context window and 128K maximum output with text input and output, and the series supports thinking mode and function calling.$d$::text),
  ($d$z-ai/glm-4.6v-flash-free$d$::text, $d$GLM 4.6V Flash (Free) is available through ZenMux's unified model API.$d$::text, $d$GLM 4.6V Flash is a lightweight vision-language model from Z.ai with native multimodal function calling. It has a 128K-token context window and accepts video, image, text and file input with text output.$d$::text)
), applied as (
  update public.v2_models m
  set description = f.new_description,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.description is not distinct from f.old_description
  returning m.model_slug
)
select count(*) as updated_rows, 15 as expected_rows from applied;
