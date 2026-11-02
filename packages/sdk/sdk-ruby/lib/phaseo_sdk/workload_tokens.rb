# Per-request credentials for trusted workloads.
#
# `api_key` may be anything responding to `call` that returns the credential for each request:
# an API key, or a short-lived token such as a GitHub Actions or Vercel OIDC token. It is called
# before every request and retry, so it can refresh tokens; cache inside it if fetching a token
# is expensive.

require "json"
require "net/http"
require "uri"

module PhaseoSdk
  # Authorization header value that asks the provider for a credential each time the client
  # builds a request, which the generated client does once per attempt (Net::HTTP calls to_s).
  # @api private
  class BearerCredential
    def initialize(provider)
      @provider = provider
    end

    def to_s
      "Bearer #{self.class.resolve(@provider)}"
    end

    def inspect
      "#<#{self.class.name}>"
    end

    def self.resolve(provider)
      value = provider.call
      raise TypeError, "The api_key callable must return a string credential." unless value.nil? || value.is_a?(String)

      credential = value.to_s.strip
      raise ArgumentError, "The api_key callable returned an empty credential." if credential.empty?

      credential
    end
  end

  # A trusted-workload token could not be fetched. Messages never include tokens.
  class WorkloadTokenError < StandardError; end

  # Credential providers for trusted workloads (beta). Pass the result as `api_key`:
  # `PhaseoSdk::Phaseo.new(api_key: PhaseoSdk::WorkloadTokens.github_actions)`.
  #
  # Both helpers accept test hooks:
  # - `http`: callable(method, url, headers, json_body) returning [status_code, body_string].
  #   Defaults to Net::HTTP with a 10-second timeout.
  # - `env`: anything responding to `[]`, such as a Hash. Defaults to ENV.
  # - `clock`: callable returning Unix seconds. Defaults to the current time.
  module WorkloadTokens
    DEFAULT_AUDIENCE = "https://api.phaseo.app".freeze
    VERCEL_EXCHANGE_URL = "https://oidc.vercel.com/~token".freeze
    TIMEOUT_SECONDS = 10
    REFRESH_MARGIN_SECONDS = 60

    module_function

    # Fetches a GitHub Actions OIDC token for Phaseo and reuses it until 60 seconds before it
    # expires. The job needs `permissions: id-token: write`.
    def github_actions(audience: DEFAULT_AUDIENCE, http: nil, env: ENV, clock: nil)
      audience = normalize_audience(audience)
      http ||= method(:send_request)
      clock ||= -> { Time.now.to_f }
      lock = Mutex.new
      cache = nil

      lambda do
        lock.synchronize do
          next cache[:token] if cache && clock.call < cache[:expires_at] - REFRESH_MARGIN_SECONDS

          request_url = env["ACTIONS_ID_TOKEN_REQUEST_URL"].to_s.strip
          request_token = env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"].to_s.strip
          if request_url.empty? || request_token.empty?
            raise WorkloadTokenError,
                  "GitHub Actions OIDC token is unavailable: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set; give the job `permissions: id-token: write`."
          end

          separator = request_url.include?("?") ? "&" : "?"
          url = "#{request_url}#{separator}audience=#{URI.encode_www_form_component(audience)}"
          status, body = http.call("GET", url, { "Authorization" => "bearer #{request_token}", "Accept" => "application/json" }, nil)
          unless status.to_i.between?(200, 299)
            raise WorkloadTokenError, "GitHub Actions OIDC token request failed with status #{status}."
          end

          payload = parse_json(body)
          token = payload["value"].is_a?(String) ? payload["value"].strip : ""
          raise WorkloadTokenError, "GitHub Actions OIDC token response has no value." if token.empty?

          expires_at = jwt_expiry(token)
          cache = expires_at && { token: token, expires_at: expires_at }
          token
        end
      end
    end

    # Exchanges the deployment's Vercel OIDC token for one issued to Phaseo and reuses it until
    # 60 seconds before it expires. The source token is `token` (a string, or a callable such as
    # one returning the request's `x-vercel-oidc-token` header), then the file named by
    # VERCEL_OIDC_TOKEN_FILE, then VERCEL_OIDC_TOKEN.
    def vercel(token: nil, audience: DEFAULT_AUDIENCE, http: nil, env: ENV, clock: nil, exchange_url: VERCEL_EXCHANGE_URL)
      audience = normalize_audience(audience)
      http ||= method(:send_request)
      clock ||= -> { Time.now.to_f }
      lock = Mutex.new
      cache = nil

      lambda do
        source = vercel_source_token(token, env)
        cache_key = [audience, source]
        lock.synchronize do
          next cache[:token] if cache && cache[:key] == cache_key && clock.call < cache[:expires_at] - REFRESH_MARGIN_SECONDS

          status, body = http.call(
            "POST",
            exchange_url,
            { "Content-Type" => "application/json", "Accept" => "application/json" },
            { "token" => source, "aud" => audience }
          )
          payload = parse_json(body)
          unless status.to_i.between?(200, 299)
            error = payload["error"]
            message = error.is_a?(Hash) ? error["message"] : error
            message = message.is_a?(String) ? message.strip : ""
            raise WorkloadTokenError,
                  "Vercel OIDC token exchange failed with status #{status}#{message.empty? ? "." : ": #{message}"}"
          end

          exchanged = payload["token"].is_a?(String) ? payload["token"].strip : ""
          raise WorkloadTokenError, "Vercel OIDC token exchange response has no token." if exchanged.empty?

          expiry = payload["expiry"]
          expires_at = expiry.is_a?(Numeric) && expiry.positive? ? expiry.to_f : jwt_expiry(exchanged)
          cache = expires_at && { key: cache_key, token: exchanged, expires_at: expires_at }
          exchanged
        end
      end
    end

    # Reads the JWT `exp` claim (Unix seconds) without checking the signature; nil if absent.
    def jwt_expiry(token)
      segment = token.to_s.split(".")[1]
      return nil if segment.nil? || segment.empty?

      segment = segment.delete("=").tr("-_", "+/")
      claims = JSON.parse((segment + ("=" * ((4 - segment.length % 4) % 4))).unpack1("m0"))
      exp = claims.is_a?(Hash) ? claims["exp"] : nil
      exp.is_a?(Numeric) && exp.positive? ? exp.to_f : nil
    rescue ArgumentError, JSON::ParserError
      nil
    end

    # Sends one request with Net::HTTP and a 10-second timeout.
    # @api private
    def send_request(method, url, headers, json_body)
      uri = URI(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = TIMEOUT_SECONDS
      http.read_timeout = TIMEOUT_SECONDS
      http.write_timeout = TIMEOUT_SECONDS
      request = Net::HTTP.const_get(method.capitalize).new(uri)
      headers.each { |name, value| request[name] = value }
      request.body = JSON.generate(json_body) unless json_body.nil?
      response = http.request(request)
      [response.code.to_i, response.body.to_s]
    end

    def vercel_source_token(token, env)
      if token.respond_to?(:call)
        value = token.call.to_s.strip
        raise WorkloadTokenError, "The Vercel OIDC token callable returned an empty token." if value.empty?

        return value
      end
      return token.strip if token.is_a?(String) && !token.strip.empty?

      path = env["VERCEL_OIDC_TOKEN_FILE"].to_s.strip
      unless path.empty?
        contents = begin
          File.read(path)
        rescue SystemCallError
          raise WorkloadTokenError, "Unable to read VERCEL_OIDC_TOKEN_FILE."
        end
        return contents.strip unless contents.strip.empty?
      end
      value = env["VERCEL_OIDC_TOKEN"].to_s.strip
      return value unless value.empty?

      raise WorkloadTokenError,
            "No Vercel OIDC token: pass token: (a string, or a callable such as one returning the x-vercel-oidc-token request header), or set VERCEL_OIDC_TOKEN_FILE or VERCEL_OIDC_TOKEN."
    end

    def parse_json(body)
      parsed = JSON.parse(body.to_s)
      parsed.is_a?(Hash) ? parsed : {}
    rescue JSON::ParserError
      {}
    end

    def normalize_audience(audience)
      value = audience.to_s.strip
      value.empty? ? DEFAULT_AUDIENCE : value
    end

    private_class_method :vercel_source_token, :parse_json, :normalize_audience
  end
end
