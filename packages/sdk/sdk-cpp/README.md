# AI Stats C++ SDK

C++ SDK preview for AI Stats Gateway.

This package currently exposes the generated headers and operation helpers.

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

using ai_stats::gen::Client;
using ai_stats::gen::Response;
using ai_stats::gen::Transport;

class CurlTransport final : public Transport {
 public:
  Response request(const std::string& method, const std::string& url, const std::string& body,
                   const std::map<std::string, std::string>& headers) override;
};

int main() {
  const char* api_key = std::getenv("AI_STATS_API_KEY");
  if (!api_key || std::string(api_key).empty()) {
    std::cerr << "AI_STATS_API_KEY is required\n";
    return 1;
  }

  std::string base_url = std::getenv("AI_STATS_BASE_URL")
      ? std::getenv("AI_STATS_BASE_URL")
      : "https://api.phaseo.app/v1";

  CurlTransport transport;
  Client client(base_url, &transport);
  client.set_header("Authorization", std::string("Bearer ") + api_key);

  const std::string payload = R"({"model":"google/gemma-3-27b:free","input":"Reply with: C++ SDK works"})";
  auto response = ai_stats::gen::CreateResponse(client, {}, payload);

  std::cout << response.body << std::endl;
  return 0;
}
```

Use `packages/sdk/sdk-cpp/tests/smoke_chat.cpp` and `packages/sdk/sdk-cpp/tests/smoke_responses.cpp` as complete transport examples.

## Environment variables

- `AI_STATS_API_KEY` (required)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:cpp`
- Smoke tests:
  - `pnpm --filter @ai-stats/cpp-sdk run smoke:chat`
  - `pnpm --filter @ai-stats/cpp-sdk run smoke:responses`
