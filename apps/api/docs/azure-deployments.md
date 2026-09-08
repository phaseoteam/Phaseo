# Azure deployments

Azure routes use `AZURE_OPENAI_BASE_URL` with either `AZURE_OPENAI_API_KEY` or `AZURE_OPENAI_AUTH_TOKEN`. The default API version is `v1`; `AZURE_OPENAI_API_VERSION` can select `preview` or a dated deployment API. Entra tokens must be refreshed by the deployment's credential provisioning process.

To route existing models to different regional resources or customer-chosen deployment names, configure the secret binding `AZURE_OPENAI_DEPLOYMENTS` as a JSON object keyed by provider model slug (or canonical model ID):

```json
{
  "gpt-5-nano": {
    "baseUrl": "https://your-europe-resource.openai.azure.com",
    "deployment": "your-chat-deployment",
    "apiKey": "<resource-specific-key>"
  },
  "claude-sonnet-4-6": {
    "baseUrl": "https://your-foundry-resource.services.ai.azure.com",
    "deployment": "your-claude-deployment",
    "authToken": "<resource-specific-entra-token>"
  }
}
```

Entries can also set `apiVersion`. An entry specifying a different `baseUrl` must provide its own key or token; the default resource credential is never reused for that entry. BYOK retains the existing credential-selection rules. A deployment-only entry inherits the default resource and credentials.

OpenAI protocol routes cover chat/Responses, embeddings, image generation/editing, speech, transcription and translation. Claude models use the Foundry Anthropic Messages endpoint. Model-specific availability and pricing still determine catalog activation; a registered endpoint does not imply that every Azure model implements that protocol.

Selecting a resource does not establish data residency by itself. Configure a regional deployment type in Azure when regional processing is required; Global and DataZone deployment types have different processing boundaries.
