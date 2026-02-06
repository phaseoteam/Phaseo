#pragma once
#include <map>
#include <string>

namespace ai_stats::gen {

struct Response {
	int status = 0;
	std::string body;
};

class Transport {
public:
	virtual ~Transport() = default;
	virtual Response request(const std::string& method, const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers) = 0;
};

class Client {
public:
	Client(std::string base_url, Transport* transport) : base_url_(std::move(base_url)), transport_(transport) {}
	void set_header(const std::string& key, const std::string& value) { headers_[key] = value; }
	Response request(const std::string& method, const std::string& path, const std::string& body = "", const std::map<std::string, std::string>& headers = {}) {
		std::map<std::string, std::string> merged = headers_;
		merged.insert(headers.begin(), headers.end());
		return transport_->request(method, base_url_ + path, body, merged);
	}

private:
	std::string base_url_;
	Transport* transport_;
	std::map<std::string, std::string> headers_;
};

} // namespace ai_stats::gen
