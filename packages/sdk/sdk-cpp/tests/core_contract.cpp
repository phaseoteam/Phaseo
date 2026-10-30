#include <cassert>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

#include "../src/gen/client.hpp"

class FakeTransport final : public phaseo::gen::Transport {
public:
  std::vector<phaseo::gen::Response> responses;
  std::vector<std::map<std::string, std::string>> captured_headers;

  phaseo::gen::Response request(
      const std::string&,
      const std::string&,
      const std::string&,
      const std::map<std::string, std::string>& headers) override {
    captured_headers.push_back(headers);
    auto response = responses.front();
    responses.erase(responses.begin());
    return response;
  }
};

void api_key_provider_runs_before_every_attempt() {
  FakeTransport transport;
  transport.responses = {
      {200, {}, "{}"},
      {200, {}, "{}"},
      {503, {{"Retry-After", "0"}}, ""},
      {200, {}, "{}"},
      {200, {}, "{}"},
  };
  phaseo::gen::Client client("https://api.test", &transport);
  int calls = 0;
  client.set_api_key_provider([&] { return "  token-" + std::to_string(++calls) + "\n"; });

  // Two requests get two different tokens.
  client.request("GET", "/one");
  client.request("GET", "/two");
  assert(transport.captured_headers[0].at("Authorization") == "Bearer token-1");
  assert(transport.captured_headers[1].at("Authorization") == "Bearer token-2");

  // A retry asks the provider again.
  phaseo::gen::RequestOptions retry_options;
  retry_options.max_retries = 1;
  assert(client.request_with_options("GET", "/retry", "", retry_options).status == 200);
  assert(transport.captured_headers[2].at("Authorization") == "Bearer token-3");
  assert(transport.captured_headers[3].at("Authorization") == "Bearer token-4");

  // A per-request Authorization header wins and the provider is not called.
  client.request("GET", "/explicit", "", {{"authorization", "Bearer explicit"}});
  assert(calls == 4);
  assert(transport.captured_headers[4].count("Authorization") == 0);
  assert(transport.captured_headers[4].at("authorization") == "Bearer explicit");

  // A blank credential is an error and nothing is sent.
  client.set_api_key_provider([] { return std::string(" \t"); });
  try {
    client.request("GET", "/blank");
    assert(false);
  } catch (const std::invalid_argument& error) {
    assert(std::string(error.what()).find("empty credential") != std::string::npos);
  }
  assert(transport.captured_headers.size() == 5);

  // Provider errors reach the caller and nothing is sent.
  client.set_api_key_provider([]() -> std::string { throw std::runtime_error("token fetch failed"); });
  try {
    client.request("GET", "/failing");
    assert(false);
  } catch (const std::runtime_error& error) {
    assert(std::string(error.what()) == "token fetch failed");
  }
  assert(transport.captured_headers.size() == 5);
}

int main() {
  api_key_provider_runs_before_every_attempt();

  FakeTransport transport;
  transport.responses = {
      {503, {{"Retry-After", "0"}}, ""},
      {200, {{"X-Request-Id", "req/1"}}, "{}"},
      {503, {}, ""},
      {429, {{"X-Request-Id", "req-2"}}, "{}"},
  };

  phaseo::gen::Client client("https://api.test", &transport);
  client.set_max_retries(1);
  int requests = 0;
  int retries = 0;
  int responses = 0;
  client.set_request_hooks(
      [&](const phaseo::gen::RequestEvent&) { ++requests; },
      [&](const phaseo::gen::ResponseEvent&) { ++responses; },
      [&](const phaseo::gen::RetryEvent&) { ++retries; });

  auto response = client.request("GET", "/safe");
  assert(response.status == 200);
  assert(response.request_id() == "req/1");
  assert(response.trace_url() == "https://phaseo.app/settings/usage/logs/requests/req%2F1");
  assert(requests == 2 && retries == 1 && responses == 1);

  phaseo::gen::RequestOptions write_options;
  write_options.max_retries = 3;
  write_options.idempotency_key = "idem-1";
  auto write_response = client.request_with_options("POST", "/write", "{}", write_options);
  assert(write_response.status == 503);
  assert(transport.captured_headers.size() == 3);
  assert(transport.captured_headers[2].at("Idempotency-Key") == "idem-1");

  try {
    phaseo::gen::RequestOptions error_options;
    error_options.max_retries = 0;
    client.request_checked("GET", "/error", "", error_options);
    assert(false);
  } catch (const phaseo::gen::RequestError& error) {
    assert(error.status() == 429);
    assert(error.request_id() == "req-2");
  }
}
