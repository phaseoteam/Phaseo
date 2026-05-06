require "minitest/autorun"
require_relative "../lib/index"

class CurrentKeyTest < Minitest::Test
  def test_get_current_api_key_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "data" => {
          "id" => "key_123",
          "prefix" => "aistats_v1_sk_test",
          "status" => "active"
        }
      }
    end

    response = client.get_current_api_key

    assert_equal "key_123", response["data"]["id"]
    assert_equal "active", response["data"]["status"]
    assert_equal [["GET", "/key", nil, nil, nil]], calls
  end
end
