# AIStatsSdk::ModerationResult

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **flagged** | **Boolean** |  | [optional] |
| **categories** | [**ModerationCategories**](ModerationCategories.md) |  | [optional] |
| **category_scores** | [**ModerationCategoryScores**](ModerationCategoryScores.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ModerationResult.new(
  flagged: null,
  categories: null,
  category_scores: null
)
```

