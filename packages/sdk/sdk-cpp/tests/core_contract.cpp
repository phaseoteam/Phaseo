#include <cassert>
#include <map>
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

int main() {
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
