# AIStatsSdk::BatchResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **object** | **String** |  | [optional] |
| **endpoint** | **String** |  | [optional] |
| **errors** | **Object** |  | [optional] |
| **input_file_id** | **String** |  | [optional] |
| **completion_window** | **String** |  | [optional] |
| **status** | **String** |  | [optional] |
| **output_file_id** | **String** |  | [optional] |
| **error_file_id** | **String** |  | [optional] |
| **created_at** | **Integer** |  | [optional] |
| **in_progress_at** | **Integer** |  | [optional] |
| **expires_at** | **Integer** |  | [optional] |
| **finalizing_at** | **Integer** |  | [optional] |
| **completed_at** | **Integer** |  | [optional] |
| **failed_at** | **Integer** |  | [optional] |
| **expired_at** | **Integer** |  | [optional] |
| **cancelling_at** | **Integer** |  | [optional] |
| **cancelled_at** | **Integer** |  | [optional] |
| **request_counts** | [**BatchRequestCounts**](BatchRequestCounts.md) |  | [optional] |
| **metadata** | **Object** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::BatchResponse.new(
  id: null,
  object: null,
  endpoint: null,
  errors: null,
  input_file_id: null,
  completion_window: null,
  status: null,
  output_file_id: null,
  error_file_id: null,
  created_at: null,
  in_progress_at: null,
  expires_at: null,
  finalizing_at: null,
  completed_at: null,
  failed_at: null,
  expired_at: null,
  cancelling_at: null,
  cancelled_at: null,
  request_counts: null,
  metadata: null
)
```

