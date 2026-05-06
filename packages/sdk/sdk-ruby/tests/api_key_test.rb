require "minitest/autorun"
require_relative "../lib/index"

class ApiKeyTest < Minitest::Test
  def test_get_api_key_returns_payload
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
          "hash" => "keyhash_123",
          "status" => "active"
        }
      }
    end

    response = client.get_api_key("key_123")

    assert_equal "key_123", response["data"]["id"]
    assert_equal "keyhash_123", response["data"]["hash"]
    assert_equal "active", response["data"]["status"]
    assert_equal [["GET", "/keys/key_123", nil, nil, nil]], calls
  end
end
