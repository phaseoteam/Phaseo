require "minitest/autorun"
require_relative "../lib/index"

class HealthTest < Minitest::Test
  def test_health_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "status" => "ok",
        "timestamp" => "2026-05-05T12:00:00.000Z"
      }
    end

    response = client.health

    assert_equal "ok", response["status"]
    assert_equal "2026-05-05T12:00:00.000Z", response["timestamp"]
    assert_equal [["GET", "/health", nil, nil, nil]], calls
  end
end
