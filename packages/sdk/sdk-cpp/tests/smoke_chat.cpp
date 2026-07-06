#include <cstdlib>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>

#include "../src/gen/client.hpp"
#include "../src/gen/operations.hpp"

using phaseo::gen::Client;
using phaseo::gen::Response;
using phaseo::gen::Transport;

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

std::string env_or_default(const char *name, const std::string &fallback) {
  const char *value = std::getenv(name);
  return value && std::string(value).size() ? value : fallback;
}

std::string json_escape(const std::string &value) {
  std::ostringstream escaped;
  for (char ch : value) {
    switch (ch) {
      case '\\':
        escaped << "\\\\";
        break;
      case '"':
        escaped << "\\\"";
        break;
      case '\n':
        escaped << "\\n";
        break;
      case '\r':
        escaped << "\\r";
        break;
      case '\t':
        escaped << "\\t";
        break;
      default:
        escaped << ch;
    }
  }
  return escaped.str();
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
      payload_path = "tests/smoke_chat_payload.json";
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
  const char *api_key = std::getenv("PHASEO_API_KEY");
  if (!api_key || std::string(api_key).empty()) {
    std::cerr << "PHASEO_API_KEY is required\n";
    return 1;
  }

  const char *base_url_env = std::getenv("PHASEO_BASE_URL");
  std::string base_url = base_url_env && std::string(base_url_env).size()
                             ? base_url_env
                             : "https://api.phaseo.app/v1";
  std::string model = env_or_default("PHASEO_SMOKE_MODEL", "openai/gpt-5.4-nano");
  std::string input = env_or_default("PHASEO_SMOKE_INPUT", "Hi");

  CurlTransport transport;
  Client client(base_url, &transport);
  client.set_header("Authorization", std::string("Bearer ") + api_key);

  std::ostringstream payload;
  payload << "{\"model\":\"" << json_escape(model)
          << "\",\"messages\":[{\"role\":\"user\",\"content\":\"" << json_escape(input) << "\"}]}";
  auto response = phaseo::gen::CreateChatCompletion(client, {}, payload.str());
  if (response.status < 200 || response.status >= 300) {
    std::cerr << "HTTP " << response.status << ": " << response.body << std::endl;
    return 1;
  }
  std::cout << response.body << std::endl;
  return 0;
}
