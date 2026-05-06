require "minitest/autorun"
require_relative "../lib/index"

class FilesTest < Minitest::Test
  def test_upload_file_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      { "id" => "file_123", "purpose" => "batch", "bytes" => 17 }
    end

    uploaded = client.upload_file(
      "purpose" => "batch",
      "file" => "data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ=="
    )

    assert_equal "file_123", uploaded["id"]
    assert_equal [["POST", "/files", nil, nil, {
      "purpose" => "batch",
      "file" => "data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ=="
    }]], calls
  end

  def test_retrieve_file_content_returns_bytes
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request_bytes) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      "{\"ok\":true}\n"
    end

    content = client.retrieve_file_content("file_123")

    assert_equal "{\"ok\":true}\n", content
    assert_equal [["get", "/files/file_123/content", nil, nil, nil]], calls
  end

  def test_retrieve_file_content_surfaces_request_errors
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    client.raw_client.define_singleton_method(:request_bytes) do |**_args|
      raise AiStats::Gen::RequestError.new(
        status_code: 404,
        status_message: "Not Found",
        response_body: "{\"error\":\"not found\"}"
      )
    end

    error = assert_raises(AiStats::Gen::RequestError) do
      client.retrieve_file_content("file_missing_123")
    end

    assert_equal 404, error.status_code
  end
end
