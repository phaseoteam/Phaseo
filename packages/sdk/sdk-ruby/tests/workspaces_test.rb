require "minitest/autorun"
require_relative "../lib/index"

class WorkspacesTest < Minitest::Test
  def test_list_and_get_workspaces_return_payloads
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      if path == "/workspaces"
        {
          "object" => "list",
          "data" => [
            { "id" => "ws_123", "slug" => "default" },
            { "id" => "ws_456", "slug" => "sandbox" }
          ]
        }
      else
        {
          "data" => {
            "id" => "ws_123",
            "slug" => "default",
            "name" => "Default Workspace"
          }
        }
      end
    end

    listed = client.list_workspaces("limit" => "2", "offset" => "3")
    retrieved = client.get_workspace("ws_123")

    assert_equal "list", listed["object"]
    assert_equal "sandbox", listed["data"][1]["slug"]
    assert_equal "ws_123", retrieved["data"]["id"]
    assert_equal "Default Workspace", retrieved["data"]["name"]
    assert_equal [
      ["GET", "/workspaces", { "limit" => "2", "offset" => "3" }, nil, nil],
      ["GET", "/workspaces/ws_123", nil, nil, nil]
    ], calls
  end
end
