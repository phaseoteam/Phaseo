# AIStatsSdk::ModerationCategoryScores

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **hate** | **Float** |  | [optional] |
| **hate_threatening** | **Float** |  | [optional] |
| **harassment** | **Float** |  | [optional] |
| **harassment_threatening** | **Float** |  | [optional] |
| **self_harm** | **Float** |  | [optional] |
| **self_harm_intent** | **Float** |  | [optional] |
| **self_harm_instructions** | **Float** |  | [optional] |
| **sexual** | **Float** |  | [optional] |
| **sexual_minors** | **Float** |  | [optional] |
| **violence** | **Float** |  | [optional] |
| **violence_graphic** | **Float** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ModerationCategoryScores.new(
  hate: null,
  hate_threatening: null,
  harassment: null,
  harassment_threatening: null,
  self_harm: null,
  self_harm_intent: null,
  self_harm_instructions: null,
  sexual: null,
  sexual_minors: null,
  violence: null,
  violence_graphic: null
)
```

