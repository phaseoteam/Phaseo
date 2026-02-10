#include <cstdlib>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>

#include "../src/gen/client.hpp"
#include "../src/gen/operations.hpp"

using ai_stats::gen::Client;
using ai_stats::gen::Response;
using ai_stats::gen::Transport;

namespace {
std::string run_command(const std::string &command) {
#ifdef _WIN32
  FILE *pipe = _popen(command.c_str(), "r");
#else
  FILE *pipe = popen(command.c_str(), "r");
#endif
  if (!pipe) {
    return "";
  }
  std::string output;
  char buffer[256];
  while (fgets(buffer, sizeof(buffer), pipe)) {
    output += buffer;
  }
#ifdef _WIN32
  _pclose(pipe);
#else
  pclose(pipe);
#endif
  return output;
}

class CurlTransport final : public Transport {
 public:
  Response request(const std::string &method, const std::string &url, const std::string &body,
                   const std::map<std::string, std::string> &headers) override {
    std::ostringstream cmd;
    cmd << "curl -s -X " << method << " \"" << url << "\"";
    for (const auto &entry : headers) {
      cmd << " -H \"" << entry.first << ": " << entry.second << "\"";
    }
    std::string payload_path;
    if (!body.empty()) {
      payload_path = "tests/smoke_responses_payload.json";
      std::ofstream payload_file(payload_path, std::ios::binary);
      payload_file << body;
      payload_file.close();
      cmd << " -H \"Content-Type: application/json\" --data-binary @\"" << payload_path << "\"";
    }
    cmd << " -w \"\\n%{http_code}\"";
    Response response;
    std::string output = run_command(cmd.str());
    auto newline = output.rfind('\n');
    if (newline != std::string::npos) {
      response.body = output.substr(0, newline);
      response.status = std::atoi(output.substr(newline + 1).c_str());
    } else {
      response.body = output;
      response.status = 0;
    }
    if (!payload_path.empty()) {
      std::remove(payload_path.c_str());
    }
    return response;
  }
};
}  // namespace

int main() {
  const char *api_key = std::getenv("AI_STATS_API_KEY");
  if (!api_key || std::string(api_key).empty()) {
    std::cerr << "AI_STATS_API_KEY is required\n";
    return 1;
  }

  const char *base_url_env = std::getenv("AI_STATS_BASE_URL");
  std::string base_url = base_url_env && std::string(base_url_env).size()
                             ? base_url_env
                             : "https://api.phaseo.app/v1";

  CurlTransport transport;
  Client client(base_url, &transport);
  client.set_header("Authorization", std::string("Bearer ") + api_key);

  std::string payload = "{\"model\":\"openai/gpt-5-nano\",\"input\":\"Hi\"}";
  auto response = ai_stats::gen::CreateResponse(client, {}, payload);
  if (response.status < 200 || response.status >= 300) {
    std::cerr << "HTTP " << response.status << ": " << response.body << std::endl;
    return 1;
  }
  std::cout << response.body << std::endl;
  return 0;
}
