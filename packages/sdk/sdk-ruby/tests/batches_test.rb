require "minitest/autorun"
require_relative "../lib/index"

class BatchesTest < Minitest::Test
  def test_create_batch_returns_payload
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "id" => "batch_123",
        "status" => "validating",
        "provider" => "openai",
        "request_id" => "req_ruby_batch_1",
        "session_id" => "session_ruby_batch_1",
        "pricing_lines" => [{ "provider" => "openai", "cost_usd" => 0.03 }]
      }
    end

    response = client.create_batch(
      "input_file_id" => "file_123",
      "endpoint" => "/v1/responses",
      "completion_window" => "24h",
      "session_id" => "session_ruby_batch_1"
    )

    assert_equal "batch_123", response["id"]
    assert_equal "validating", response["status"]
    assert_equal "openai", response["provider"]
    assert_equal "req_ruby_batch_1", response["request_id"]
    assert_equal "session_ruby_batch_1", response["session_id"]
    assert_equal "openai", response.dig("pricing_lines", 0, "provider")
    assert_equal [["POST", "/batches", nil, nil, {
      "input_file_id" => "file_123",
      "endpoint" => "/v1/responses",
      "completion_window" => "24h",
      "session_id" => "session_ruby_batch_1"
    }]], calls
  end

  def test_retrieve_batch_returns_payload
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "id" => "batch_123",
        "status" => "completed",
        "provider" => "openai",
        "request_id" => "req_ruby_batch_2",
        "session_id" => "session_ruby_batch_1",
        "request_counts" => { "total" => 4, "completed" => 3, "failed" => 1 },
        "billing" => { "charged" => true, "cost_usd" => 0.12 }
      }
    end

    response = client.retrieve_batch("batch_123")

    assert_equal "batch_123", response["id"]
    assert_equal "completed", response["status"]
    assert_equal "openai", response["provider"]
    assert_equal "req_ruby_batch_2", response["request_id"]
    assert_equal "session_ruby_batch_1", response["session_id"]
    assert_equal 4, response.dig("request_counts", "total")
    assert_equal true, response.dig("billing", "charged")
    assert_equal [["GET", "/batches/batch_123", nil, nil, nil]], calls
  end

  def test_cancel_batch_returns_payload
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      { "id" => "batch_123", "status" => "cancelling" }
    end

    response = client.cancel_batch("batch_123")

    assert_equal "batch_123", response["id"]
    assert_equal "cancelling", response["status"]
    assert_equal(
      "wss://api.phaseo.app/v1/async/batch/batch_123/ws?interval_ms=1500&close_on_terminal=false",
      client.batch_websocket_url("batch_123", interval_ms: 1500, close_on_terminal: false)
    )
    assert_equal(
      "wss://api.phaseo.app/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
      client.get_async_job_websocket_url("video", "video 123", interval_ms: 1500, close_on_terminal: false)
    )
    assert_equal [["POST", "/batches/batch_123/cancel", nil, nil, nil]], calls
  end

  def test_cancel_batch_surfaces_request_errors
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    client.raw_client.define_singleton_method(:request) do |**_args|
      raise Phaseo::Gen::RequestError.new(
        status_code: 404,
        status_message: "Not Found",
        response_body: "{\"error\":\"not found\"}"
      )
    end

    error = assert_raises(Phaseo::Gen::RequestError) do
      client.cancel_batch("batch_missing_123")
    end

    assert_equal 404, error.status_code
  end
end
