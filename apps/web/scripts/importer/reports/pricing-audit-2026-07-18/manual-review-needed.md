# Pricing review note

The automatic pass added all pricing that could be verified from the supplied and official provider sources. Eleven active routes still have no current pricing file and need a manual provider review:

- Ambient: `moonshotai/kimi-k2.7-code`, `z-ai/glm-5.2` (two route mappings)
- Avian: `deepseek/deepseek-v3.2`, `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`, `minimax/minimax-m2.5`, `moonshotai/kimi-k2.5`, `moonshotai/kimi-k2.6`, `z-ai/glm-5`, `z-ai/glm-5.1`

OpenAI batch routes for image, video, moderation, and embedding models resolve through existing capability-specific pricing keys and are not actionable gaps. Computer Use Preview now has standard pricing of $3 input / $12 output per 1M text tokens and Batch pricing of $1.50 / $6; there are no cache meters. Its provider mapping remains scheduled to retire on **2026-07-23**.
