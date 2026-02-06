# AIStatsSdk::ModerationCategories

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **hate** | **Boolean** |  | [optional] |
| **hate_threatening** | **Boolean** |  | [optional] |
| **harassment** | **Boolean** |  | [optional] |
| **harassment_threatening** | **Boolean** |  | [optional] |
| **self_harm** | **Boolean** |  | [optional] |
| **self_harm_intent** | **Boolean** |  | [optional] |
| **self_harm_instructions** | **Boolean** |  | [optional] |
| **sexual** | **Boolean** |  | [optional] |
| **sexual_minors** | **Boolean** |  | [optional] |
| **violence** | **Boolean** |  | [optional] |
| **violence_graphic** | **Boolean** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ModerationCategories.new(
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

