<!-- Trimmed excerpt of https://docs.venice.ai/changelog.md fetched 2026-11-17. -->

# Changelog

> Changes to the Venice API: each month's new endpoints, parameters, errors and limits, and every model added, deprecated, removed or repriced.

API changes, such as new endpoints, parameters, errors and limits, are collected each month. Model changes are recorded from `GET /models` as they happen: models added, deprecated or removed, and price changes, starting October 1, 2026. Upcoming removals are also on the [deprecations page](https://docs.venice.ai/overview/deprecations.md), and changes to the Venice apps are in the [Venice changelog](https://venice.ai/changelog).

Follow this page with the [RSS feed](https://docs.venice.ai/changelog/rss.xml), or read it as Markdown at [changelog.md](https://docs.venice.ai/changelog.md).

**November 17, 2026**

**Added**

* [Kimi K3.1 Pro](https://docs.venice.ai/models/kimi-k3-1-pro.md?v=e2ee-kimi-k3-1-pro-p): `e2ee-kimi-k3-1-pro-p`, $2.50 input and $12.50 output per 1M tokens

**Price changes**

* [Qwen 4 Max](https://docs.venice.ai/models/qwen-4-max.md): `qwen-4-max`, input $1.875 to $1.50, output $5.625 to $4.50, cache read $0.09375 to $0.075, cache write $2.34375 to $1.875 per 1M tokens

**November 16, 2026**

**Added**

* [Qwen 4 Max](https://docs.venice.ai/models/qwen-4-max.md): `qwen-4-max`, $1.875 input and $5.625 output per 1M tokens

**November 13, 2026**

**Removed**

* Claude Opus 4.8 Fast: `claude-opus-4-8-fast`

**November 12, 2026**

**Added**

* [Gemini 4 Carbon](https://docs.venice.ai/models/gemini-4-carbon.md): `gemini-4-carbon`, $2.50 input and $12.50 output per 1M tokens
* [Pareto](https://docs.venice.ai/models/pareto.md): `pareto`, $1.00 input and $4.00 output per 1M tokens

**November 10, 2026**

**Added**

* [Seedream V5.5](https://docs.venice.ai/models/seedream-v5-5.md?v=seedream-v5-5-edit): `seedream-v5-5-edit`, from \$0.03 per edit

**Deprecated**

* [Gemma 4 Uncensored](https://docs.venice.ai/models/gemma-4-uncensored.md): `gemma-4-uncensored`, removed on November 18, 2026; use `google-gemma-4-26b-a4b-it` instead

**No longer scheduled for removal**

* [DeepSeek V4.1 Flash](https://docs.venice.ai/models/deepseek-v4-1-flash.md): `deepseek-v4-1-flash`

**Removed**

* Seedance 1.5 Pro: `seedance-1-5-pro-text-to-video-basic`, `seedance-1-5-pro-image-to-video-basic`

**Price changes**

* [Seedream V5.5](https://docs.venice.ai/models/seedream-v5-5.md?v=seedream-v5-5-edit): `seedream-v5-5-edit`, per edit $0.03 to $0.0255, extra input image $0.010695 to $0.01019924, 1 $0.03 to $0.0255, 1K $0.03 to $0.0255, 2K $0.05 to $0.051
* [Seedream V5.5](https://docs.venice.ai/models/seedream-v5-5.md?v=seedream-v5-5-edit): `seedream-v5-5-edit`, `seedream-v5-5`, 1 $0.0255 to $0.034

**November 9, 2026**

**Added**

* [Claude Fable 5.2](https://docs.venice.ai/models/claude-fable-5-2.md): `claude-fable-5-2`, $8.00 input and $40.00 output per 1M tokens

**Removed**

* Mercury 2: `mercury-2`
* Mercury 2.5: `mercury-2-5`
* Mercury 3: `mercury-3`

**November 4, 2026**

**Deprecated**

* [Kimi K2.5](https://docs.venice.ai/models/kimi-k2-5.md): `kimi-k2-5`, removed on November 18, 2026

**Price changes**

* [Kimi K3.1 Pro](https://docs.venice.ai/models/kimi-k3-1-pro.md): `kimi-k3-1-pro`, input $3.75 to $2.00, output $18.75 to $10.00, cache read $0.375 to $0.20 per 1M tokens
* [Kimi K3.1 Pro Highspeed](https://docs.venice.ai/models/kimi-k3-1-pro-highspeed.md): `kimi-k3-1-pro-highspeed`, input $7.50 to $5.00, output $37.50 to $25.00, cache read $0.75 to $0.375 per 1M tokens

**November 2, 2026**

**Added**

* [Seedance 2.5](https://docs.venice.ai/models/seedance-2-5.md?v=seedance-2-5-edit-video-basic): `seedance-2-5-edit-video-basic`

**Removed**

* Grok Imagine High Quality: `grok-imagine-quality-edit`
* Grok Imagine High Quality (SOTA): `grok-imagine-image-quality`
* Hermes 3 Llama 3.1 405b: `hermes-3-llama-3.1-405b`

**October 2026**

* **Default Model Trait** — The `default` and `function_calling_default` traits now point to `deepseek-v4-1-flash-1017-uncensored` instead of `zai-org-glm-5-2`, so requests that send either trait as `model`, and lookups through `GET /models/traits`, now get the new model.
* **OpenAI Model Names** — `gpt-4o`, `gpt-4o-2024-05-13`, `gpt-4o-2024-08-06`, `gpt-4o-2024-11-20` and `chatgpt-4o-latest` now resolve to `openai-gpt-4o-2024-11-20`, and `gpt-4o-mini`, `gpt-4o-mini-2024-07-18` and the `gpt-3.5-turbo` names resolve to `openai-gpt-4o-mini-2024-07-18`, instead of `llama-3.3-70b`, and are billed at the resolved model's price. Keys restricted to private models still get `llama-3.3-70b`.
* **Claude Model Names** — Older Claude names now resolve to Claude models instead of `llama-3.3-70b` or a 404: Claude 3, 3.5, 3.7 and 4.0 Sonnet names such as `claude-3-5-sonnet-20241022` go to `claude-sonnet-5-5`, Claude 3, 3.5 and 4.5 Haiku names go to `claude-haiku-5-5`, and Claude 3, 4.0 and 4.1 Opus names go to `claude-opus-4-8`, billed at the resolved model's price. `claude-opus-4-5-20251101` is now an alias of `claude-opus-4-5`, and keys restricted to private models still get `llama-3.3-70b` for the four names it served before.

<!-- Synthetic test section: proves day sections after monthly prose are parsed again. -->

**October 1, 2026**

**Deprecated**

* Claude Sonnet 4.5: `claude-sonnet-4-5`, removed on October 30, 2026

**Removed**

* Hermes 3 Llama 3.1 405b: `hermes-3-llama-3.1-405b`, removed on November 2, 2026; use `deepseek-v4-1-flash` instead
