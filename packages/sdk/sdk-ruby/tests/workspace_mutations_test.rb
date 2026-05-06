require "minitest/autorun"
require_relative "../lib/index"

class WorkspaceMutationsTest < Minitest::Test
  def test_workspace_mutation_helpers_return_payloads
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      case [method, path]
      when ["POST", "/workspaces"]
        { "data" => { "id" => "ws_123", "slug" => "sandbox", "name" => "Sandbox Workspace" } }
      when ["PATCH", "/workspaces/ws_123"]
        { "data" => { "id" => "ws_123", "slug" => "sandbox", "name" => "Renamed Workspace", "archived" => true } }
      when ["DELETE", "/workspaces/ws_123"]
        { "data" => { "id" => "ws_123", "deleted" => true } }
      else
        raise "Unexpected request"
      end
    end

    created = client.create_workspace("name" => "Sandbox Workspace", "slug" => "sandbox")
    updated = client.update_workspace("ws_123", "name" => "Renamed Workspace", "archived" => true)
    deleted = client.delete_workspace("ws_123")

    assert_equal "sandbox", created["data"]["slug"]
    assert_equal true, updated["data"]["archived"]
    assert_equal true, deleted["data"]["deleted"]
    assert_equal [
      ["POST", "/workspaces", nil, nil, { "name" => "Sandbox Workspace", "slug" => "sandbox" }],
      ["PATCH", "/workspaces/ws_123", nil, nil, { "name" => "Renamed Workspace", "archived" => true }],
      ["DELETE", "/workspaces/ws_123", nil, nil, nil]
    ], calls
  end
end
