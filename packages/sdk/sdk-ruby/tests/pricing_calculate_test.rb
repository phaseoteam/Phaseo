require "minitest/autorun"
require_relative "../lib/index"

class PricingCalculateTest < Minitest::Test
  def test_calculate_pricing_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "ok" => true,
        "pricing" => {
          "total_cost_usd" => 0.00025,
          "currency" => "USD"
        }
      }
    end

    payload = {
      "provider" => "openai",
      "model" => "openai/gpt-5-mini",
      "endpoint" => "responses",
      "usage" => { "input_tokens" => 1000 }
    }

    response = client.calculate_pricing(payload)

    assert_equal true, response["ok"]
    assert_equal 0.00025, response["pricing"]["total_cost_usd"]
    assert_equal [["POST", "/pricing/calculate", nil, nil, payload]], calls
  end
end
