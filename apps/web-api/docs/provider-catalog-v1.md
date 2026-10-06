# Provider catalog feed V1

Use a public HTTPS URL that returns a JSON document with a non-empty `data` array. A query string is allowed, for example `https://provider.example/models?format=phaseo-v1`. The URL must return the document directly with HTTP 200; redirects are rejected. Add that URL during provider onboarding. Phaseo previews and validates the feed before saving it.

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

`id` is the canonical `publisher/model` identifier used for matching and review. `provider_model_slug` is the identifier to send to your inference endpoint. Declare only the capabilities and parameters that endpoint actually supports. New canonical models require review; a feed entry alone does not publish or enable a route. A model matched to an existing hidden canonical model also stays in review.

`price_nanos` is a JSON number in nanodollars per `unit_quantity` units. It must be non-negative. Send the **effective price Phaseo should bill**, including a promotion when one applies. Publish a new feed snapshot when a promotion starts or ends so Phaseo can retain price history. Version 1 does not schedule future discounts or automatically derive a billable rate from a percentage or display label. Conditional price rows can be reviewed, but they are not automatically promoted to routing.

Use `availability: "not_ready"` for an offer that cannot yet serve traffic. Availability does not control whether a model is hidden from Phaseo's public catalog; publication remains subject to review and route readiness. For a route to become billable, Phaseo also needs its endpoint, credentials, adapter, pricing meters, and a successful probe.

The version 1 schema URL remains stable. Future optional fields can be added without breaking version 1 feeds; incompatible changes will use a new versioned contract with a migration period.
