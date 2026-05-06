require "minitest/autorun"
require_relative "../lib/index"

class ApiKeysTest < Minitest::Test
  def test_list_api_keys_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "object" => "list",
        "data" => [
          { "id" => "key_123", "status" => "active" },
          { "id" => "key_456", "status" => "disabled" }
        ]
      }
    end

    response = client.list_api_keys("disabled" => "true", "limit" => "2")

    assert_equal "list", response["object"]
    assert_equal "key_123", response["data"][0]["id"]
    assert_equal "disabled", response["data"][1]["status"]
    assert_equal [["GET", "/keys", { "disabled" => "true", "limit" => "2" }, nil, nil]], calls
  end
end
