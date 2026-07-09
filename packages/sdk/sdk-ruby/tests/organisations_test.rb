require "minitest/autorun"
require_relative "../lib/index"

class OrganisationsTest < Minitest::Test
  def test_list_organisations_returns_payload
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "ok" => true,
        "limit" => 2,
        "offset" => 3,
        "total" => 1,
        "organisations" => [
          {
            "organisation_id" => "org_123",
            "name" => "Anthropic",
            "country_code" => "US",
            "colour" => "#D97706"
          }
        ]
      }
    end

    response = client.list_organisations("limit" => "2", "offset" => "3")

    assert_equal true, response["ok"]
    assert_equal "org_123", response["organisations"][0]["organisation_id"]
    assert_equal [["GET", "/organisations", { "limit" => "2", "offset" => "3" }, nil, nil]], calls
  end
end
