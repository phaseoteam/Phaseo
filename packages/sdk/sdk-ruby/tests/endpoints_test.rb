require "minitest/autorun"
require_relative "../lib/index"

class EndpointsTest < Minitest::Test
  def test_list_endpoints_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "ok" => true,
        "endpoints" => ["chat/completions", "responses", "files"],
        "sample_models" => ["openai/gpt-5-nano"]
      }
    end

    response = client.list_endpoints

    assert_equal true, response["ok"]
    assert_equal "openai/gpt-5-nano", response["sample_models"][0]
    assert_equal [["GET", "/endpoints", nil, nil, nil]], calls
  end
end
