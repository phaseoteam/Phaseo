require "json"
require "net/http"
require "uri"

module AiStats
  module Gen
    class RequestError < StandardError
      attr_reader :status_code, :response_body

      def initialize(status_code:, response_body:, status_message: nil, message: nil)
        super(message || build_message(status_code, response_body, status_message))
        @status_code = status_code
        @response_body = response_body
      end

      private

      def build_message(status_code, response_body, status_message)
        trimmed = response_body.to_s.strip
        prefix = status_message.to_s.strip.empty? ? "Request failed: #{status_code}" : "Request failed: #{status_code} #{status_message}"
        return prefix if trimmed.empty?

        "#{prefix} #{trimmed}"
      end
    end

    class Client
      def initialize(base_url:, headers: {})
        @base_url = base_url.chomp("/")
        @headers = headers
      end

      def build_request(method:, path:, query: nil, headers: nil, body: nil)
        uri = URI.join(@base_url + "/", path.sub(%r{^/}, ""))
        uri.query = URI.encode_www_form(query) if query && !query.empty?
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = uri.scheme == "https"
        request_class = Net::HTTP.const_get(method.capitalize)
        req = request_class.new(uri)
        (@headers || {}).merge(headers || {}).each { |k, v| req[k] = v }
        if body
          req["Content-Type"] = "application/json"
          req.body = JSON.dump(body)
        end
        [http, req]
      end

      def request(method:, path:, query: nil, headers: nil, body: nil)
        http, req = build_request(method:, path:, query:, headers:, body:)
        response = http.request(req)
        unless response.is_a?(Net::HTTPSuccess)
          raise RequestError.new(status_code: response.code.to_i, response_body: response.body.to_s)
        end
        return nil if response.body.nil? || response.body.empty?
        JSON.parse(response.body)
      end

      def request_bytes(method:, path:, query: nil, headers: nil, body: nil)
        http, req = build_request(method:, path:, query:, headers:, body:)
        response = http.request(req)
        unless response.is_a?(Net::HTTPSuccess)
          raise RequestError.new(status_code: response.code.to_i, response_body: response.body.to_s)
        end
        response.body.to_s.b
      end
    end
  end
end
