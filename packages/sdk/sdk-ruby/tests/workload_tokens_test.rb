require "minitest/autorun"
require "socket"
require "tempfile"
require_relative "../lib/index"

# Minimal local HTTP server: records each request and answers with the next queued response.
class LocalServer
  attr_reader :requests

  def initialize(responses)
    @responses = responses
    @requests = []
    @server = TCPServer.new("127.0.0.1", 0)
    @thread = Thread.new do
      loop do
        socket = @server.accept
        head = +""
        while (line = socket.gets)
          head << line
          break if line == "\r\n"
        end
        length = head[/Content-Length:\s*(\d+)/i, 1].to_i
        body = length.positive? ? socket.read(length) : ""
        request_line, *header_lines = head.split("\r\n")
        headers = header_lines.to_h { |line| name, value = line.split(":", 2); [name.downcase, value.to_s.strip] }
        @requests << { line: request_line, headers: headers, body: body }
        status, payload, extra = @responses.shift || [200, { ok: true }, {}]
        json = JSON.generate(payload)
        extra_lines = (extra || {}).map { |name, value| "#{name}: #{value}\r\n" }.join
        socket.write("HTTP/1.1 #{status} X\r\nContent-Type: application/json\r\n#{extra_lines}Content-Length: #{json.bytesize}\r\nConnection: close\r\n\r\n#{json}")
        socket.close
      end
    rescue IOError, Errno::EBADF
      nil
    end
  end

  def url
    "http://127.0.0.1:#{@server.addr[1]}"
  end

  def close
    @server.close
    @thread.join(2)
    @thread.kill
  end
end

def jwt_with_exp(exp)
  "header.#{[JSON.generate({ "exp" => exp })].pack("m0").tr("+/", "-_").delete("=")}.sig"
end

class CredentialProviderTest < Minitest::Test
  def setup
    @server = LocalServer.new([])
  end

  def teardown
    @server.close
  end

  def client_with(api_key)
    PhaseoSdk::Phaseo.new(api_key: api_key, base_path: "#{@server.url}/v1", enable_deprecation_warnings: false)
  end

  def test_each_request_gets_a_fresh_credential
    calls = 0
    client = client_with(-> { calls += 1; "  token-#{calls}  " })
    client.request_with_response(method: "GET", path: "/echo")
    client.request_with_response(method: "GET", path: "/echo")
    assert_equal ["Bearer token-1", "Bearer token-2"], @server.requests.map { |r| r[:headers]["authorization"] }
  end

  def test_retry_calls_the_provider_again
    @server.close
    @server = LocalServer.new([[503, { error: "busy" }, { "Retry-After" => "0" }]])
    calls = 0
    client = client_with(-> { calls += 1; "token-#{calls}" }).set_max_retries(1)
    response = client.request_with_response(method: "GET", path: "/flaky")
    assert_equal 200, response.status_code
    assert_equal 2, calls
    assert_equal ["Bearer token-1", "Bearer token-2"], @server.requests.map { |r| r[:headers]["authorization"] }
  end

  def test_blank_or_failing_provider_sends_nothing
    error = assert_raises(ArgumentError) { client_with(-> { "  " }).request_with_response(method: "GET", path: "/echo") }
    assert_includes error.message, "empty credential"
    assert_raises(RuntimeError) { client_with(-> { raise "provider failed" }).request_with_response(method: "GET", path: "/echo") }
    assert_empty @server.requests
  end

  def test_per_request_authorization_wins
    calls = 0
    client = client_with(-> { calls += 1; "token" })
    client.request_with_response(method: "GET", path: "/echo", headers: { "authorization" => "Bearer caller" })
    client.request_with_response(method: "GET", path: "/echo", options: { headers: { "AUTHORIZATION" => "Bearer option" } })
    assert_equal 0, calls
    assert_equal ["Bearer caller", "Bearer option"], @server.requests.map { |r| r[:headers]["authorization"] }
  end

  def test_static_key_and_generated_operations_unchanged
    client_with("sk-static").health
    assert_equal "Bearer sk-static", @server.requests.first[:headers]["authorization"]
  end

  def test_credential_not_in_inspect_output
    client = client_with(-> { "secret-token" })
    refute_includes client.raw_client.inspect, "secret-token"
    refute_includes client.inspect, "secret-token"
  end

  def test_github_helper_over_net_http
    @server.close
    @server = LocalServer.new([[200, { value: jwt_with_exp(2_000_000_000) }, {}]])
    env = { "ACTIONS_ID_TOKEN_REQUEST_URL" => "#{@server.url}/token?api-version=2.0", "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "request-token" }
    token = PhaseoSdk::WorkloadTokens.github_actions(env: env).call
    assert_equal jwt_with_exp(2_000_000_000), token
    request = @server.requests.first
    assert_equal "GET /token?api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app HTTP/1.1", request[:line]
    assert_equal "bearer request-token", request[:headers]["authorization"]
  end
end

class WorkloadTokensTest < Minitest::Test
  def test_github_caches_until_near_exp
    now = 1_000_000
    exp = now + 600
    requests = []
    http = lambda do |method, url, headers, body|
      requests << [method, url, headers, body]
      [200, JSON.generate({ value: jwt_with_exp(exp) })]
    end
    env = { "ACTIONS_ID_TOKEN_REQUEST_URL" => "https://token.example/x", "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "rt" }
    provider = PhaseoSdk::WorkloadTokens.github_actions(audience: "https://aud.example", http: http, env: env, clock: -> { now })
    first = provider.call
    assert_equal ["GET", "https://token.example/x?audience=https%3A%2F%2Faud.example"], requests[0][0, 2]
    assert_equal "bearer rt", requests[0][2]["Authorization"]
    now += 500
    assert_equal first, provider.call
    assert_equal 1, requests.size
    now += 50
    exp = now + 600
    refute_equal first, provider.call
    assert_equal 2, requests.size
  end

  def test_github_errors
    env = { "ACTIONS_ID_TOKEN_REQUEST_URL" => "https://token.example/x", "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "rt" }
    error = assert_raises(PhaseoSdk::WorkloadTokenError) { PhaseoSdk::WorkloadTokens.github_actions(env: {}).call }
    assert_includes error.message, "id-token: write"
    error = assert_raises(PhaseoSdk::WorkloadTokenError) { PhaseoSdk::WorkloadTokens.github_actions(env: env, http: ->(*) { [403, "{}"] }).call }
    assert_includes error.message, "403"
    refute_includes error.message, "rt"
    error = assert_raises(PhaseoSdk::WorkloadTokenError) { PhaseoSdk::WorkloadTokens.github_actions(env: env, http: ->(*) { [200, "{}"] }).call }
    assert_includes error.message, "no value"
  end

  def test_github_does_not_cache_without_exp
    calls = 0
    env = { "ACTIONS_ID_TOKEN_REQUEST_URL" => "https://token.example/x", "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "rt" }
    provider = PhaseoSdk::WorkloadTokens.github_actions(env: env, http: ->(*) { calls += 1; [200, JSON.generate({ value: "opaque" })] })
    2.times { assert_equal "opaque", provider.call }
    assert_equal 2, calls
  end

  def test_vercel_exchanges_and_caches_until_near_expiry
    now = 2_000_000
    requests = []
    http = lambda do |method, url, headers, body|
      requests << [method, url, headers, body]
      [200, JSON.generate({ token: "phaseo-#{requests.size}", expiry: now + 300 })]
    end
    file = Tempfile.new("vercel-oidc")
    file.write("  file-token\n")
    file.close
    env = { "VERCEL_OIDC_TOKEN_FILE" => file.path, "VERCEL_OIDC_TOKEN" => "env-token" }
    provider = PhaseoSdk::WorkloadTokens.vercel(http: http, env: env, clock: -> { now })
    assert_equal "phaseo-1", provider.call
    method, url, headers, body = requests[0]
    assert_equal ["POST", "https://oidc.vercel.com/~token"], [method, url]
    assert_equal({ "token" => "file-token", "aud" => "https://api.phaseo.app" }, body)
    assert_equal "application/json", headers["Content-Type"]
    assert_equal "application/json", headers["Accept"]
    now += 200
    assert_equal "phaseo-1", provider.call
    now += 50
    assert_equal "phaseo-2", provider.call
    assert_equal 2, requests.size

    file.unlink
    PhaseoSdk::WorkloadTokens.vercel(http: http, env: { "VERCEL_OIDC_TOKEN" => "env-token" }, clock: -> { now }).call
    assert_equal "env-token", requests.last[3]["token"]
    PhaseoSdk::WorkloadTokens.vercel(token: -> { "header-token" }, http: http, env: {}, clock: -> { now }).call
    assert_equal "header-token", requests.last[3]["token"]
  end

  def test_vercel_errors
    env = { "VERCEL_OIDC_TOKEN" => "env-token" }
    error = assert_raises(PhaseoSdk::WorkloadTokenError) do
      PhaseoSdk::WorkloadTokens.vercel(env: env, http: ->(*) { [400, JSON.generate({ error: "invalid audience" })] }).call
    end
    assert_includes error.message, "status 400: invalid audience"
    error = assert_raises(PhaseoSdk::WorkloadTokenError) { PhaseoSdk::WorkloadTokens.vercel(env: env, http: ->(*) { [200, "{}"] }).call }
    assert_includes error.message, "no token"
    error = assert_raises(PhaseoSdk::WorkloadTokenError) { PhaseoSdk::WorkloadTokens.vercel(env: {}).call }
    assert_includes error.message, "VERCEL_OIDC_TOKEN"
  end
end
