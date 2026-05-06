require "minitest/autorun"
require_relative "../lib/index"

class PricingModelsTest < Minitest::Test
  def test_list_pricing_models_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "ok" => true,
        "models" => [
          {
            "provider" => "openai",
            "model" => "openai/gpt-5-mini",
            "endpoint" => "responses",
            "display_name" => "GPT-5 Mini",
            "meters" => [
              {
                "meter" => "input_tokens",
                "unit" => "tokens",
                "unit_size" => 1000,
                "price_per_unit" => "0.00025",
                "currency" => "USD"
              }
            ]
          }
        ]
      }
    end

    response = client.list_pricing_models("provider" => "openai")

    assert_equal true, response["ok"]
    assert_equal "openai", response["models"][0]["provider"]
    assert_equal [["GET", "/pricing/models", { "provider" => "openai" }, nil, nil]], calls
  end
end
