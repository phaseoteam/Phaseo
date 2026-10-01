require "minitest/autorun"
require_relative "../lib/index"

class ModelsTest < Minitest::Test
  def test_list_models_preserves_availability_reason
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "ok" => true,
        "availability_mode" => "all",
        "models" => [
          {
            "id" => "openai/gpt-5-mini",
            "providers" => [
              {
                "api_provider_id" => "openai",
                "availability_status" => "coming_soon",
                "availability_reason" => "scheduled"
              }
            ]
          }
        ]
      }
    end

    response = client.list_models("availability" => "all")

    assert_equal "all", response["availability_mode"]
    assert_equal "coming_soon", response["models"][0]["providers"][0]["availability_status"]
    assert_equal "scheduled", response["models"][0]["providers"][0]["availability_reason"]
    assert_equal [["GET", "/models", {"availability" => "all"}, nil, nil]], calls
  end

  def test_parameter_support_highlights_invalid_value
    report = PhaseoSdk::Phaseo.check_parameter_support(
      {
        "id" => "openai/example",
        "endpoints" => [{
          "id" => "openai:responses", "endpoint" => "responses", "routable" => true, "status" => "active",
          "provider" => { "id" => "openai" },
          "capabilities" => { "parameters" => ["temperature"], "parameter_details" => { "temperature" => { "supported" => true, "minimum" => 0, "maximum" => 1 } } }
        }]
      },
      { "temperature" => 1.5 }
    )

    refute report[:ok]
    assert_equal "supported", report[:parameters][0][:status]
    assert_empty report[:parameters][0][:accepted_by]
  end
end
