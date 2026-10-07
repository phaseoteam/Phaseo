# EmpirioLabs inference

The provider ID is `empiriolabs`. The provider executor translates the gateway IR
through the shared OpenAI wire implementation. Chat and Messages requests use
`POST https://api.empiriolabs.ai/v1/chat/completions`; Responses requests use
`/v1/responses` for compatible models. The four Chat-only model families in the
submitted v1 feed use Chat Completions. Model capabilities and pricing remain
controlled by the provider catalog; registering the executor does not activate routes.

Both streaming and non-streaming requests retain the client's streaming mode.
The shared executor normalizes output, tool calls, reasoning and token usage.
Provider model IDs come from the selected catalog route, not the canonical model ID.
Unsupported generation modalities are not registered.

## Credentials and rollout

Store `EMPIRIOLABS_API_KEY` in Infisical's `prod` environment under `/provider-keys`.
CI loads it through the existing OIDC identity and installs it as a Worker secret
on the global, EU and US gateways. The runtime also supports workspace BYOK.
Never put the credential in the catalog feed, a pull request or debug output.
`EMPIRIOLABS_BASE_URL` is an optional runtime override of the API origin.

Before public routing, deploy the executor, verify credentials and inference,
approve the provider identity and set the appropriate provider/route readiness
flags. Keep unverified models disabled. Catalog validation verifies structure,
not live inference or billable usage correctness.

## Contract sources

- [Compatibility](https://docs.empiriolabs.ai/compatibility)
- [Bearer authentication](https://docs.empiriolabs.ai/authentication)
- The submitted `https://api.empiriolabs.ai/v1/models?format=phaseo-v1` feed
  declared 50 Chat Completions models and 46 Responses models on 7 October 2026.

Live inference remains to be verified with the funded credential.
