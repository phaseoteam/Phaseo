# Phaseo C++ SDK

C++ SDK preview for Phaseo Gateway.

This package currently exposes the generated headers and operation helpers.

`src/phaseo.hpp` adds `GetModelEndpointCapabilities` plus `CheckParameterSupport`. The checker returns route matches and highlights unsupported, partially supported, unknown, and out-of-range values. Because the preview C++ transport returns raw JSON, deserialize the capability response into `ModelEndpointCapabilities` before calling the checker.

`PreflightRequest` validates a complete request from the same capability object.
`workflows.hpp` adds typed `PageIterator<T>` and `JobHandle<T>` helpers for lazy
pagination and resuming existing asynchronous jobs.

## Status

- Preview SDK
- Generated client surface only
- Requires a transport implementation in your application

## Requirements

- C++17 compiler
- `curl` available in your environment (used by smoke examples)

## Quick start

```cpp
#include <cstdlib>
#include <iostream>
#include <map>
#include <string>

#include "src/gen/client.hpp"
#include "src/gen/operations.hpp"

using phaseo::gen::Client;
using phaseo::gen::Response;
using phaseo::gen::Transport;

class CurlTransport final : public Transport {
 public:
  Response request(const std::string& method, const std::string& url, const std::string& body,
                   const std::map<std::string, std::string>& headers) override;
};

int main() {
  const char* api_key = std::getenv("PHASEO_API_KEY");
  if (!api_key || std::string(api_key).empty()) {
    std::cerr << "PHASEO_API_KEY is required\n";
    return 1;
  }

  std::string base_url = std::getenv("PHASEO_BASE_URL")
      ? std::getenv("PHASEO_BASE_URL")
      : "https://api.phaseo.app/v1";

  CurlTransport transport;
  Client client(base_url, &transport);
  client.set_header("Authorization", std::string("Bearer ") + api_key);

  const std::string payload = R"({"model":"google/gemma-3-27b:free","input":"Reply with: C++ SDK works"})";
  auto response = phaseo::gen::CreateResponse(client, {}, payload);

  std::cout << response.body << std::endl;
  return 0;
}
```

Use `packages/sdk/sdk-cpp/tests/smoke_chat.cpp` and `packages/sdk/sdk-cpp/tests/smoke_responses.cpp` as complete transport examples.

## Trusted workloads (OIDC tokens instead of an API key)

Workspaces in the trusted workloads beta can let GitHub Actions jobs and Vercel deployments call Phaseo with their short-lived OIDC token instead of an API key. Set up a trust policy in Settings → API Keys → Trusted workloads, then give the client a credential provider instead of a fixed `Authorization` header. Tokens must be issued for the audience `https://api.phaseo.app`.

```cpp
client.set_api_key_provider([] {
  // Return the current token. Throwing stops the request.
  return fetch_oidc_token();
});
```

The provider is called before every request and retry, and its result is sent as `Authorization: Bearer <token>`, so each attempt uses a current token. Cache inside the provider if fetching a token is expensive. An empty result throws `std::invalid_argument` and the request is not sent. A request that sets its own `Authorization` header keeps it, and the provider is not called.

The C++ SDK has no HTTP stack of its own, so it has no built-in token helpers. Fetch the token with the same HTTP library as your transport:

- **GitHub Actions** (the job needs `permissions: id-token: write`): `GET` the URL in `ACTIONS_ID_TOKEN_REQUEST_URL` with `audience=https%3A%2F%2Fapi.phaseo.app` appended to its query string and the header `Authorization: bearer <ACTIONS_ID_TOKEN_REQUEST_TOKEN>`. The token is the `value` field of the JSON response.
- **Vercel**: take the deployment's OIDC token (the `x-vercel-oidc-token` request header, or the `VERCEL_OIDC_TOKEN` environment variable) and `POST` `{"token": "<that token>", "aud": "https://api.phaseo.app"}` as JSON to `https://oidc.vercel.com/~token`. The token is the `token` field of the JSON response; `expiry` is when it expires, in Unix seconds.

Both tokens last a few minutes. Reuse one until shortly before it expires rather than fetching a new one for every request.

## Environment variables

- `PHASEO_API_KEY` (required)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:cpp`
- Smoke tests:
  - `pnpm --filter @phaseo/cpp-sdk run smoke:chat`
  - `pnpm --filter @phaseo/cpp-sdk run smoke:responses`
