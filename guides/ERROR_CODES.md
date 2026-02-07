# Gateway Error Codes

Base error codes emitted by the gateway error handler. Upstream provider errors may pass through their own codes in the `error` field; when that happens, these base codes are still used as fallbacks.

## Response shape (error)

- `generation_id` (string)
- `status_code` (number)
- `error` (string)
- `description` (string)
- `details` (array, optional; present for validation errors)

The gateway also sets `X-Gateway-Error-Attribution` to `user` or `upstream`.

## Base codes

- `validation_error` (HTTP 400)
  - Request schema validation or unsupported parameter combinations.
- `unsupported_model_or_endpoint` (HTTP 400)
  - No providers available for the requested model/endpoint.
- `pricing_not_configured` (HTTP 402)
  - Provider pricing is missing for the requested model.
- `upstream_error` (HTTP 502)
  - Upstream provider failed or returned an invalid response.
- `before_error` (HTTP 500, fallback)
  - Fallback code when no specific error is available during pre-execute validation.
