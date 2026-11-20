require "minitest/autorun"
require "pathname"
require "stringio"
require "tmpdir"
require_relative "../lib/index"

class FilesTest < Minitest::Test
  def upload_client(calls)
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      { "id" => "file_123", "purpose" => "batch", "bytes" => 17 }
    end
    client
  end

  def test_upload_file_returns_payload
    calls = []
    uploaded = upload_client(calls).upload_file(
      "purpose" => "batch",
      "file" => { file_name: "input.jsonl", content: "{\"test\":true}\n" }
    )

    assert_equal "file_123", uploaded["id"]
    assert_equal 1, calls.length
    method, path, query, _headers, body = calls.first
    assert_equal ["POST", "/batches/files", nil], [method, path, query]
    assert_instance_of Phaseo::Gen::RawBody, body
    assert_match %r{\Amultipart/form-data; boundary=}, body.content_type
    assert_includes body.bytes, "name=\"file\"; filename=\"input.jsonl\"\r\nContent-Type: application/octet-stream"
    assert_includes body.bytes, "{\"test\":true}\n"
    assert_includes body.bytes, "name=\"purpose\"\r\n\r\nbatch\r\n"
  end

  def test_upload_file_with_pathname_uses_basename
    Dir.mktmpdir do |dir|
      path = File.join(dir, "requests.jsonl")
      File.binwrite(path, "{\"a\":1}\n")
      calls = []
      upload_client(calls).upload_file("purpose" => "batch", "file" => Pathname.new(path))

      body = calls.first[4]
      assert_includes body.bytes, "name=\"file\"; filename=\"requests.jsonl\""
      assert_includes body.bytes, "{\"a\":1}\n"
    end
  end

  def test_upload_file_with_io_and_sibling_filename
    calls = []
    upload_client(calls).upload_file(
      "purpose" => "batch",
      "file" => StringIO.new("{\"b\":2}\n"),
      "filename" => "stream.jsonl",
      "content_type" => "application/jsonl"
    )

    body = calls.first[4]
    assert_includes body.bytes, "name=\"file\"; filename=\"stream.jsonl\"\r\nContent-Type: application/jsonl"
    refute_includes body.bytes, "name=\"filename\""
    refute_includes body.bytes, "name=\"content_type\""
  end

  def test_upload_file_rejects_plain_string
    calls = []
    error = assert_raises(ArgumentError) do
      upload_client(calls).upload_file("purpose" => "batch", "file" => "input.jsonl", "filename" => "input.jsonl")
    end

    assert_match(/Pathname\.new/, error.message)
    assert_empty calls
  end

  def test_upload_file_rejects_io_without_filename
    calls = []
    error = assert_raises(ArgumentError) do
      upload_client(calls).upload_file("purpose" => "batch", "file" => StringIO.new("{}\n"))
    end

    assert_match(/filename/, error.message)
    assert_empty calls
  end

  def test_retrieve_file_content_returns_bytes
    client = PhaseoSdk::Phaseo.new(
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
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    client.raw_client.define_singleton_method(:request_bytes) do |**_args|
      raise Phaseo::Gen::RequestError.new(
        status_code: 404,
        status_message: "Not Found",
        response_body: "{\"error\":\"not found\"}"
      )
    end

    error = assert_raises(Phaseo::Gen::RequestError) do
      client.retrieve_file_content("file_missing_123")
    end

    assert_equal 404, error.status_code
  end
end
