require "json"
require "net/http"
require "time"
require "uri"

module Phaseo
  module Gen
    class Response
      attr_reader :status_code, :headers, :body, :request_id, :trace_url

      def initialize(status_code:, headers:, body:)
        @status_code = status_code
        @headers = headers
        @body = body
        @request_id = headers["x-request-id"] || headers["request-id"]
        @trace_url = headers["x-phaseo-trace-url"]
      end
    end

    class RequestError < StandardError
      attr_reader :status_code, :response_body, :headers, :code, :request_id, :trace_url, :retry_after

      def initialize(status_code:, response_body:, headers: {}, status_message: nil, message: nil)
        super(message || build_message(status_code, response_body, status_message))
        @status_code = status_code
        @response_body = response_body
        @headers = headers
        @request_id = headers["x-request-id"] || headers["request-id"]
        @trace_url = headers["x-phaseo-trace-url"]
        @retry_after = headers["retry-after"]
        @code = parse_code(response_body)
      end

      private

      def parse_code(response_body)
        parsed = JSON.parse(response_body.to_s)
        error = parsed.is_a?(Hash) ? parsed["error"] : nil
        value = error.is_a?(Hash) ? error["code"] : parsed["code"]
        value.to_s unless value.nil?
      rescue JSON::ParserError, TypeError
        nil
      end

      def build_message(status_code, response_body, status_message)
        trimmed = response_body.to_s.strip
        prefix = status_message.to_s.strip.empty? ? "Request failed: #{status_code}" : "Request failed: #{status_code} #{status_message}"
        return prefix if trimmed.empty?

        "#{prefix} #{trimmed}"
      end
    end

    class Client
      attr_accessor :timeout, :max_retries, :on_request, :on_response, :on_retry

      def initialize(base_url:, headers: {}, timeout: 60, max_retries: 0, on_request: nil, on_response: nil, on_retry: nil)
        @base_url = base_url.chomp("/")
        @headers = headers
        @timeout = timeout
        @max_retries = max_retries
        @on_request = on_request
        @on_response = on_response
        @on_retry = on_retry
      end

      def build_request(method:, path:, query: nil, headers: nil, body: nil, options: nil)
        options ||= {}
        uri = URI.join(@base_url + "/", path.sub(%r{^/}, ""))
        uri.query = URI.encode_www_form(query) if query && !query.empty?
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = uri.scheme == "https"
        timeout = options.fetch(:timeout, @timeout)
        http.open_timeout = timeout if timeout
        http.read_timeout = timeout if timeout
        request_class = Net::HTTP.const_get(method.capitalize)
        req = request_class.new(uri)
        merged_headers = (@headers || {}).merge(headers || {}).merge(options.fetch(:headers, {}))
        idempotency_key = options[:idempotency_key]
        merged_headers["Idempotency-Key"] = idempotency_key if idempotency_key
        merged_headers.each { |k, v| req[k] = v }
        if body
          req["Content-Type"] = "application/json"
          req.body = JSON.dump(body)
        end
        [http, req]
      end

      def request(method:, path:, query: nil, headers: nil, body: nil)
        request_with_response(method:, path:, query:, headers:, body:).body
      end

      def request_with_response(method:, path:, query: nil, headers: nil, body: nil, options: nil)
        options ||= {}
        normalized_method = method.to_s.upcase
        retries = options.fetch(:max_retries, @max_retries).to_i
        raise ArgumentError, "max_retries must be non-negative" if retries.negative?
        retries = 0 unless ["GET", "HEAD"].include?(normalized_method)
        attempt = 0
        loop do
          http, req = build_request(method: normalized_method, path:, query:, headers:, body:, options:)
          @on_request&.call(method: normalized_method, path: path, attempt: attempt)
          response = http.request(req)
          response_headers = response.each_header.to_h
          status_code = response.code.to_i
          if retryable_status?(status_code) && attempt < retries
            delay = retry_delay(response_headers["retry-after"], attempt)
            @on_retry&.call(method: normalized_method, path: path, attempt: attempt + 1, status_code: status_code, delay: delay)
            sleep(delay) if delay.positive?
            attempt += 1
            next
          end
          @on_response&.call(method: normalized_method, path: path, attempt: attempt, status_code: status_code, headers: response_headers)
          unless response.is_a?(Net::HTTPSuccess)
            raise RequestError.new(status_code: status_code, response_body: response.body.to_s, headers: response_headers, status_message: response.message)
          end
          parsed_body = response.body.nil? || response.body.empty? ? nil : JSON.parse(response.body)
          return Response.new(status_code: status_code, headers: response_headers, body: parsed_body)
        end
      end

      def request_bytes(method:, path:, query: nil, headers: nil, body: nil)
        http, req = build_request(method:, path:, query:, headers:, body:)
        response = http.request(req)
        unless response.is_a?(Net::HTTPSuccess)
          raise RequestError.new(status_code: response.code.to_i, response_body: response.body.to_s, headers: response.each_header.to_h)
        end
        response.body.to_s.b
      end

      def request_stream(method:, path:, query: nil, headers: nil, body: nil)
        return enum_for(__method__, method:, path:, query:, headers:, body:) unless block_given?
        http, req = build_request(method:, path:, query:, headers: (headers || {}).merge("Accept" => "text/event-stream"), body:)
        http.request(req) do |response|
          unless response.is_a?(Net::HTTPSuccess)
            raise RequestError.new(status_code: response.code.to_i, response_body: response.body.to_s, headers: response.each_header.to_h)
          end
          buffer = String.new
          response.read_body do |chunk|
            buffer << chunk
            while (index = buffer.index("\n"))
              yield buffer.slice!(0, index + 1).sub(/\r?\n\z/, "")
            end
          end
          yield buffer unless buffer.empty?
        end
      end

      private

      def retryable_status?(status_code)
        [408, 429, 500, 502, 503, 504].include?(status_code)
      end

      def retry_delay(retry_after, attempt)
        return [retry_after.to_f, 60.0].min if retry_after && retry_after.match?(/\A\d+(?:\.\d+)?\z/)
        if retry_after
          parsed = Time.httpdate(retry_after) rescue nil
          return [[parsed - Time.now, 0].max, 60.0].min if parsed
        end
        [0.25 * (2**attempt), 8.0].min
      end
    end
  end
end
