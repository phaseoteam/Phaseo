require "minitest/autorun"
require_relative "../lib/index"

class ApiKeyMutationsTest < Minitest::Test
  def test_api_key_mutation_helpers_return_payloads
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      case [method, path]
      when ["POST", "/keys"]
        { "data" => { "id" => "key_123", "name" => "Admin Key", "status" => "active" } }
      when ["PATCH", "/keys/key_123"]
        { "data" => { "id" => "key_123", "name" => "Renamed Key", "status" => "disabled" } }
      when ["DELETE", "/keys/key_123"]
        { "data" => { "id" => "key_123", "deleted" => true } }
      else
        raise "Unexpected request"
      end
    end

    created = client.create_api_key("name" => "Admin Key", "scopes" => ["gateway:read"])
    updated = client.update_api_key("key_123", "name" => "Renamed Key", "disabled" => true)
    deleted = client.delete_api_key("key_123")

    assert_equal "active", created["data"]["status"]
    assert_equal "disabled", updated["data"]["status"]
    assert_equal true, deleted["data"]["deleted"]
    assert_equal [
      ["POST", "/keys", nil, nil, { "name" => "Admin Key", "scopes" => ["gateway:read"] }],
      ["PATCH", "/keys/key_123", nil, nil, { "name" => "Renamed Key", "disabled" => true }],
      ["DELETE", "/keys/key_123", nil, nil, nil]
    ], calls
  end
end
