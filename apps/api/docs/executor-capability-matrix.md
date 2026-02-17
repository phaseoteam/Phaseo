# Executor Capability Matrix

Generated: 2026-02-17T08:58:26.116Z

This file tracks provider support at the executor resolver level.
Status is derived from `isProviderCapabilityEnabled(providerId, capability)`.

## Capability Matrix

| provider | text | embeddings | moderations | image_gen | image_edit | audio_speech | audio_transcribe | audio_translate | video | ocr | music |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ai21 | yes | no | no | no | no | no | no | no | no | no | no |
| aion-labs | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| alibaba | yes | no | no | yes | yes | yes | yes | yes | yes | no | no |
| amazon-bedrock | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| anthropic | yes | no | no | no | no | no | no | no | no | no | no |
| arcee-ai | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| atlascloud | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| azure | yes | no | no | no | no | no | no | no | no | no | no |
| baseten | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| black-forest-labs | no | no | no | yes | yes | no | no | no | no | no | no |
| bytedance-seed | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| cerebras | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| chutes | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| clarifai | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| cloudflare | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| cohere | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| crusoe | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| deepinfra | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| deepseek | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| elevenlabs | no | no | no | no | no | yes | yes | no | no | no | yes |
| featherless | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| fireworks | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| friendli | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| gmicloud | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| google | yes | yes | no | yes | yes | yes | yes | yes | yes | no | no |
| google-ai-studio | yes | yes | no | yes | no | no | no | no | yes | no | no |
| google-vertex | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| groq | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| hyperbolic | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| inception | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| infermatic | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| inflection | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| liquid-ai | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| mancer | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| minimax | yes | no | no | yes | yes | yes | yes | yes | yes | no | yes |
| minimax-lightning | yes | no | no | yes | yes | yes | yes | yes | yes | no | yes |
| mistral | yes | no | no | yes | yes | yes | yes | yes | no | yes | no |
| moonshot-ai | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| moonshot-ai-turbo | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| morph | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| morpheus | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| nebius-token-factory | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| novitaai | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| openai | yes | yes | yes | yes | yes | yes | yes | yes | yes | no | no |
| parasail | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| perplexity | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| phala | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| qwen | yes | no | no | yes | yes | yes | yes | yes | yes | no | no |
| relace | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| sambanova | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| siliconflow | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| sourceful | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| suno | no | no | no | no | no | no | no | no | no | no | yes |
| together | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| weights-and-biases | yes | no | no | yes | yes | yes | yes | yes | no | no | no |
| x-ai | yes | no | no | yes | yes | yes | yes | yes | yes | no | no |
| xiaomi | yes | no | no | no | no | no | no | no | no | no | no |
| z-ai | yes | no | no | yes | yes | yes | yes | yes | no | no | no |

## Canonical Provider Aliases

| canonical_provider | aliases |
| --- | --- |
| aion-labs | aionlabs |
| arcee-ai | arcee |
| atlascloud | atlas-cloud |
| liquid-ai | liquid |
| x-ai | xai |
| z-ai | zai |

## Notes

- This matrix reflects resolver capability enablement, not live upstream provider health.
- `yes` means the resolver can select an executor for that provider/capability.
- `no` means the resolver currently blocks that provider/capability.
