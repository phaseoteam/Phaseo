require "json"
require "net/http"
require "uri"

module AiStats
  module Gen
    class Client
      def initialize(base_url:, headers: {})
        @base_url = base_url.chomp("/")
        @headers = headers
      end

      def request(method:, path:, query: nil, headers: nil, body: nil)
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
        response = http.request(req)
        unless response.is_a?(Net::HTTPSuccess)
          raise "Request failed: #{response.code} #{response.message}"
        end
        return nil if response.body.nil? || response.body.empty?
        JSON.parse(response.body)
      end
    end
  end
end
