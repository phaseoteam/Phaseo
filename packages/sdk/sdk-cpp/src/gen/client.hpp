#pragma once
#include <algorithm>
#include <chrono>
#include <cctype>
#include <functional>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>

namespace phaseo::gen {

struct Response {
	int status = 0;
	std::map<std::string, std::string> headers;
	std::string body;
	std::optional<std::string> header(const std::string& name) const {
		for (const auto& [key, value] : headers) {
			if (key.size() == name.size() && std::equal(key.begin(), key.end(), name.begin(), [](char a, char b) { return std::tolower(static_cast<unsigned char>(a)) == std::tolower(static_cast<unsigned char>(b)); })) return value;
		}
		return std::nullopt;
	}
	std::optional<std::string> request_id() const { auto value = header("x-request-id"); return value ? value : header("request-id"); }
	std::optional<std::string> trace_url() const { return header("x-phaseo-trace-url"); }
};

struct RequestOptions {
	std::map<std::string, std::string> headers;
	std::optional<long long> timeout_ms;
	std::optional<unsigned int> max_retries;
	std::optional<std::string> idempotency_key;
};

struct RequestEvent { std::string method; std::string path; unsigned int attempt = 0; };
struct ResponseEvent { std::string method; std::string path; unsigned int attempt = 0; int status = 0; std::map<std::string, std::string> headers; };
struct RetryEvent { std::string method; std::string path; unsigned int attempt = 0; int status = 0; std::chrono::milliseconds delay{0}; };

class RequestError : public std::runtime_error {
public:
	explicit RequestError(Response response) : std::runtime_error("Phaseo request failed: " + std::to_string(response.status)), response_(std::move(response)) {}
	const Response& response() const { return response_; }
	int status() const { return response_.status; }
	std::optional<std::string> request_id() const { return response_.request_id(); }
	std::optional<std::string> trace_url() const { return response_.trace_url(); }
private:
	Response response_;
};

class Transport {
public:
	virtual ~Transport() = default;
	virtual Response request(const std::string& method, const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers) = 0;
	virtual Response request_with_options(const std::string& method, const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers, const RequestOptions& options) {
		auto merged = headers;
		for (const auto& [key, value] : options.headers) merged[key] = value;
		if (options.idempotency_key) merged["Idempotency-Key"] = *options.idempotency_key;
		return request(method, url, body, merged);
	}
};

class Client {
public:
	Client(std::string base_url, Transport* transport) : base_url_(std::move(base_url)), transport_(transport) {
		headers_["X-Phaseo-Client"] = "phaseo-cpp";
		headers_["X-Phaseo-Client-Version"] = "1.0.2";
	}
	void set_header(const std::string& key, const std::string& value) { headers_[key] = value; }
	void set_timeout(std::chrono::milliseconds timeout) { timeout_ = timeout; }
	void set_max_retries(unsigned int max_retries) { max_retries_ = max_retries; }
	void set_request_hooks(std::function<void(const RequestEvent&)> on_request, std::function<void(const ResponseEvent&)> on_response, std::function<void(const RetryEvent&)> on_retry) { on_request_ = std::move(on_request); on_response_ = std::move(on_response); on_retry_ = std::move(on_retry); }
	Response request(const std::string& method, const std::string& path, const std::string& body = "", const std::map<std::string, std::string>& headers = {}) {
		RequestOptions options; options.headers = headers; return request_with_options(method, path, body, options);
	}
	Response request_with_options(const std::string& method, const std::string& path, const std::string& body, RequestOptions options) {
		if (!options.timeout_ms) options.timeout_ms = timeout_.count();
		const bool safe = method == "GET" || method == "HEAD" || method == "get" || method == "head";
		const auto retries = safe ? options.max_retries.value_or(max_retries_) : 0;
		for (unsigned int attempt = 0;; ++attempt) {
			if (on_request_) on_request_({method, path, attempt});
			auto response = transport_->request_with_options(method, base_url_ + path, body, headers_, options);
			const bool retryable = response.status == 408 || response.status == 429 || response.status == 500 || response.status == 502 || response.status == 503 || response.status == 504;
			if (retryable && attempt < retries) {
				auto delay = std::chrono::milliseconds(250 * (1 << std::min(attempt, 5u)));
				if (auto retry_after = response.header("retry-after")) { try { delay = std::chrono::milliseconds(static_cast<long long>(std::stod(*retry_after) * 1000)); } catch (...) {} }
				if (on_retry_) on_retry_({method, path, attempt + 1, response.status, delay});
				if (delay.count() > 0) std::this_thread::sleep_for(delay);
				continue;
			}
			if (on_response_) on_response_({method, path, attempt, response.status, response.headers});
			return response;
		}
	}
	Response request_checked(const std::string& method, const std::string& path, const std::string& body = "", RequestOptions options = {}) {
		auto response = request_with_options(method, path, body, std::move(options));
		if (response.status < 200 || response.status >= 300) throw RequestError(std::move(response));
		return response;
	}

private:
	std::string base_url_;
	Transport* transport_;
	std::map<std::string, std::string> headers_;
	std::chrono::milliseconds timeout_{60000};
	unsigned int max_retries_ = 0;
	std::function<void(const RequestEvent&)> on_request_;
	std::function<void(const ResponseEvent&)> on_response_;
	std::function<void(const RetryEvent&)> on_retry_;
};

} // namespace phaseo::gen
