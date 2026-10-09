# Azure decisions

Microsoft Decision runs through the existing decisions IR, response validation, and billing pipeline. It calls the Foundry resource's `/providers/microsoft/v1/systemone` endpoint. Set the catalog route's provider model slug to the Azure deployment name, or override it through the existing `AZURE_OPENAI_DEPLOYMENTS` secret:

```json
{
  "microsoft-decision-1": { "deployment": "phaseo-decision-1" }
}
```

This entry inherits the default resource and credentials. A mapping with a different `baseUrl` requires its own `apiKey` or `authToken`. Both API-key and Entra bearer authentication are supported; Entra tokens require the `https://cognitiveservices.azure.com/.default` scope. The decision endpoint does not use `AZURE_OPENAI_API_VERSION`.

The executor accepts text and JSON evidence and rejects media, streaming, tools, `safety_identifier`, and `service_tier`. It validates typed answers and token usage through the shared System One completion handler. The route must have a `decisions.make` capability and pricing SKU; actual input tokens are billed against that SKU, with free output represented by a zero output meter. Enable routing only after deploying the executor, configuring credentials, and verifying inference.

Contract source: [Deploy and use Microsoft-Decision-1](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision).
