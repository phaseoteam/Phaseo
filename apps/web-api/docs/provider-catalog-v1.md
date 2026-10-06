# Provider catalog feed V1

Use a public HTTPS URL that returns a JSON document with a `data` array. An empty array retires your feed-managed offers. A query string is allowed, for example `https://provider.example/models?format=phaseo-v1`. The URL must return the document directly with HTTP 200; redirects are rejected. Add that URL during provider onboarding. Phaseo previews and validates the feed before saving it.

The [machine-readable version 1 schema](https://phaseo.app/api/internal/provider-catalog/schema) is the field-level contract. Here is a minimal billable model:

```json
{
  "data": [{
    "id": "publisher/model-1",
    "name": "Model 1",
    "provider_model_slug": "model-1",
    "availability": "ready",
    "capabilities": [{"id": "responses", "parameters": ["temperature", "max_output_tokens"]}],
    "pricing": [
      {
        "meter_key": "input_tokens",
        "modality": "text",
        "direction": "input",
        "unit": "token",
        "unit_quantity": 1000000,
        "price_nanos": 250000000,
        "display_label": "Input",
        "display_unit": "1M tokens"
      },
      {
        "meter_key": "output_tokens",
        "modality": "text",
        "direction": "output",
        "unit": "token",
        "unit_quantity": 1000000,
        "price_nanos": 750000000,
        "display_label": "Output",
        "display_unit": "1M tokens"
      }
    ]
  }]
}
```

`id` is the canonical `publisher/model` identifier used for matching. `provider_model_slug` is the identifier to send to your inference endpoint. After provider approval, validated offers for existing models apply automatically. Existing shared models can be supported without changing their canonical records. New model IDs require administrator approval and must use your provider namespace or the lab namespace assigned to your provider. Pending proposals do not publish models or routes. A feed cannot expose a hidden or stealth canonical model owned by another source. Declare only the capabilities and parameters that endpoint actually supports. Protocol aliases such as `responses` and `chat.completions` map to the canonical `text.generate` capability; their supported parameters are combined. Prices are stored against each canonical capability so the gateway can use them for billing.

`price_nanos` is a JSON number in nanodollars per `unit_quantity` units. It must be non-negative. Send the **effective price Phaseo should bill**, including a promotion when one applies. Publish a new feed snapshot when a promotion starts or ends. Changed prices take effect when applied, with earlier prices retained in history. Unchanged snapshots do not create new price versions. Version 1 does not schedule future discounts or derive billable rates from a percentage or display label. Conditional price rows are rejected with validation errors.

Use `availability: "not_ready"` for an offer that cannot yet serve traffic. New upcoming models stay hidden until release. Runnable offers require the provider's configured endpoint, credentials, adapter, and pricing meters. Phaseo blocks remain effective even when the provider updates its feed. Omitting a model retires only that provider's feed-managed offer; canonical models and price history remain intact.

The version 1 schema URL remains stable. Future optional fields can be added without breaking version 1 feeds; incompatible changes will use a new versioned contract with a migration period.
