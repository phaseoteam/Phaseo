require "minitest/autorun"
require_relative "../lib/index"

class ProviderOpsTest < Minitest::Test
  def test_provider_and_usage_helpers_return_payloads
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      case path
      when "/providers"
        { "ok" => true, "providers" => [{ "provider_id" => "openai", "name" => "OpenAI" }] }
      when "/credits"
        { "ok" => true, "credits" => { "balance_usd" => 42.5 } }
      when "/activity"
        { "ok" => true, "total" => 1, "activity" => [{ "request_id" => "req_123" }] }
      when "/analytics"
        { "data" => [{ "date" => "2026-05-01", "endpoint_id" => "responses", "requests" => 12 }] }
      else
        raise "Unexpected request"
      end
    end

    providers = client.list_providers("limit" => "2")
    credits = client.get_credits("team_id" => "team_123")
    activity = client.get_activity("days" => "30")
    analytics = client.get_analytics("date" => "2026-05-01")

    assert_equal "openai", providers["providers"][0]["provider_id"]
    assert_equal 42.5, credits["credits"]["balance_usd"]
    assert_equal "req_123", activity["activity"][0]["request_id"]
    assert_equal "responses", analytics["data"][0]["endpoint_id"]
    assert_equal [
      ["GET", "/providers", { "limit" => "2" }, nil, nil],
      ["GET", "/credits", { "team_id" => "team_123" }, nil, nil],
      ["GET", "/activity", { "days" => "30" }, nil, nil],
      ["GET", "/analytics", { "date" => "2026-05-01" }, nil, nil]
    ], calls
  end
end
