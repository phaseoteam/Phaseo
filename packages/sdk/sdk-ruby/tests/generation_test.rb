require "minitest/autorun"
require_relative "../lib/index"

class GenerationTest < Minitest::Test
  def test_get_generation_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "id" => "gen_123",
        "provider" => "openai",
        "request_id" => "req_ruby_generation_1",
        "status_code" => 200
      }
    end

    response = client.get_generation("gen_123")

    assert_equal "gen_123", response["id"]
    assert_equal "openai", response["provider"]
    assert_equal "req_ruby_generation_1", response["request_id"]
    assert_equal [["GET", "/generations", { "id" => "gen_123" }, nil, nil]], calls
  end
end
