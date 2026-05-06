require "minitest/autorun"
require_relative "../lib/index"

class TeamModelsTest < Minitest::Test
  def test_list_team_models_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "ok" => true,
        "limit" => 2,
        "models" => [{"id" => "openai/gpt-5-mini", "endpoints" => ["responses"]}]
      }
    end

    response = client.list_team_models("limit" => "2", "endpoints" => "responses")

    assert_equal true, response["ok"]
    assert_equal "openai/gpt-5-mini", response["models"][0]["id"]
    assert_equal [["GET", "/gateway/models/me", {"limit" => "2", "endpoints" => "responses"}, nil, nil]], calls
  end
end
