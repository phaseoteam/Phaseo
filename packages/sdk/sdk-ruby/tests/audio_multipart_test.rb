require "minitest/autorun"
require "pathname"
require "socket"
require "stringio"
require "tmpdir"
require_relative "../lib/index"

# Sends audio and batch uploads through a real local HTTP server and checks the wire format.
class AudioMultipartTest < Minitest::Test
  Captured = Struct.new(:request_line, :headers, :body)

  def with_server(response_body)
    server = TCPServer.new("127.0.0.1", 0)
    captured = []
    thread = Thread.new do
      socket = server.accept
      socket.binmode
      request_line = socket.gets.to_s.strip
      headers = {}
      while (line = socket.gets)
        break if line == "\r\n"
        name, value = line.split(":", 2)
        headers[name.strip.downcase] = value.to_s.strip
      end
      length = headers["content-length"].to_i
      body = length.positive? ? socket.read(length) : ""
      captured << Captured.new(request_line, headers, body)
      socket.write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: #{response_body.bytesize}\r\nConnection: close\r\n\r\n#{response_body}")
      socket.close
    ensure
      server.close
    end
    client = PhaseoSdk::Phaseo.new(
      api_key: "test",
      base_path: "http://127.0.0.1:#{server.addr[1]}/v1",
      enable_deprecation_warnings: false,
      lifecycle_resolver: ->(model_id) { { model_id: model_id, status: "active" } }
    )
    result = yield client
    thread.join(5)
    [result, captured.first]
  end

  # Splits a multipart body into { name => { filename:, content_type:, value: } } (last wins) plus
  # the raw list of [name, value] pairs.
  def parse_multipart(captured)
    boundary = captured.headers["content-type"][/boundary=(.+)\z/, 1]
    refute_nil boundary, "multipart boundary missing"
    parts = captured.body.b.split("--#{boundary}".b)[1..-2]
    parts.map do |part|
      head, value = part.sub(/\A\r\n/, "").split("\r\n\r\n".b, 2)
      disposition = head[/Content-Disposition: ([^\r\n]+)/i, 1]
      {
        name: disposition[/name="([^"]*)"/, 1],
        filename: disposition[/filename="([^"]*)"/, 1],
        content_type: head[/Content-Type: ([^\r\n]+)/i, 1],
        value: value.sub(/\r\n\z/, "")
      }
    end
  end

  def file_part(captured)
    parse_multipart(captured).find { |part| part[:name] == "file" }
  end

  def test_transcription_with_file_object_sends_multipart
    audio = "RIFF\x00\x01fake-wav-bytes".b
    result, captured = with_server('{"text":"hello"}') do |client|
      client.generate_transcription(
        "model" => "example/transcribe-1",
        "file" => { file_name: "clip.wav", content: audio, content_type: "audio/x-wav" },
        "language" => "en",
        "temperature" => 0.2,
        "stream" => false,
        "timestamp_granularities" => ["word", "segment"],
        "provider" => { "order" => ["example"] }
      )
    end

    assert_equal "hello", result["text"]
    assert_equal "POST /v1/audio/transcriptions HTTP/1.1", captured.request_line
    assert_match %r{\Amultipart/form-data; boundary=}, captured.headers["content-type"]
    parts = parse_multipart(captured)
    file = parts.find { |part| part[:name] == "file" }
    refute_nil file, "file part missing"
    assert_equal "clip.wav", file[:filename]
    assert_equal "audio/x-wav", file[:content_type]
    assert_equal audio, file[:value]
    fields = parts.reject { |part| part[:name] == "file" }.to_h { |part| [part[:name], part[:value]] }
    assert_equal "example/transcribe-1", fields["model"]
    assert_equal "en", fields["language"]
    assert_equal "0.2", fields["temperature"]
    assert_equal "false", fields["stream"]
    assert_equal '["word","segment"]', fields["timestamp_granularities"]
    assert_equal '{"order":["example"]}', fields["provider"]
    refute fields.key?("filename")
    refute fields.key?("content_type")
  end

  def test_file_object_accepts_string_keys_and_io_content
    _result, captured = with_server('{"text":"hi"}') do |client|
      client.generate_transcription(
        "model" => "example/transcribe-1",
        "file" => { "file_name" => "note.flac", "content" => StringIO.new("flac-bytes") }
      )
    end

    file = file_part(captured)
    assert_equal "note.flac", file[:filename]
    assert_equal "audio/flac", file[:content_type]
    assert_equal "flac-bytes", file[:value]
  end

  def test_transcription_with_url_only_sends_json
    _result, captured = with_server('{"text":"hello"}') do |client|
      client.generate_transcription("model" => "example/transcribe-1", "file_url" => "https://example.com/a.mp3")
    end

    assert_equal "application/json", captured.headers["content-type"]
    assert_equal({ "model" => "example/transcribe-1", "file_url" => "https://example.com/a.mp3" }, JSON.parse(captured.body))
  end

  def test_translation_with_pathname_uses_basename
    Dir.mktmpdir do |dir|
      path = File.join(dir, "speech.ogg")
      File.binwrite(path, "OggS-bytes".b)
      _result, captured = with_server('{"text":"hi"}') do |client|
        client.generate_translation(model: "example/transcribe-1", file: Pathname.new(path))
      end

      assert_equal "POST /v1/audio/translations HTTP/1.1", captured.request_line
      assert_match %r{\Amultipart/form-data; boundary=}, captured.headers["content-type"]
      parts = parse_multipart(captured)
      file = parts.find { |part| part[:name] == "file" }
      assert_equal "speech.ogg", file[:filename]
      assert_equal "audio/ogg", file[:content_type]
      assert_equal "OggS-bytes".b, file[:value]
      assert_equal "example/transcribe-1", parts.find { |part| part[:name] == "model" }[:value]
    end
  end

  def test_translation_with_file_io_uses_its_own_name
    Dir.mktmpdir do |dir|
      path = File.join(dir, "memo.webm")
      File.binwrite(path, "webm-bytes".b)
      _result, captured = File.open(path, "rb") do |io|
        with_server('{"text":"hi"}') do |client|
          client.create_translation("model" => "example/transcribe-1", "file" => io)
        end
      end

      file = file_part(captured)
      assert_equal "memo.webm", file[:filename]
      assert_equal "audio/webm", file[:content_type]
      assert_equal "webm-bytes", file[:value]
    end
  end

  def test_io_with_sibling_filename
    _result, captured = with_server('{"text":"hi"}') do |client|
      client.create_translation(
        "model" => "example/transcribe-1",
        "file" => StringIO.new("mp3-bytes"),
        "filename" => "clip.mp3"
      )
    end

    file = file_part(captured)
    assert_equal "clip.mp3", file[:filename]
    assert_equal "audio/mpeg", file[:content_type]
    assert_equal "mp3-bytes", file[:value]
  end

  def test_unknown_extension_falls_back_to_octet_stream
    _result, captured = with_server('{"text":"hi"}') do |client|
      client.create_transcription("model" => "example/transcribe-1", "file" => StringIO.new("x"), "filename" => "clip.xyz")
    end

    assert_equal "application/octet-stream", file_part(captured)[:content_type]
  end

  def test_io_without_filename_raises
    client = PhaseoSdk::Phaseo.new(api_key: "test", enable_deprecation_warnings: false)
    error = assert_raises(ArgumentError) do
      client.create_translation("model" => "example/transcribe-1", "file" => StringIO.new("mp3-bytes"))
    end

    assert_match(/filename/, error.message)
    assert_match(/extension/, error.message)
  end

  def test_plain_string_file_raises
    client = PhaseoSdk::Phaseo.new(api_key: "test", enable_deprecation_warnings: false)
    error = assert_raises(ArgumentError) do
      client.generate_transcription("model" => "example/transcribe-1", "file" => "clip.wav", "filename" => "clip.wav")
    end

    assert_match(/Pathname\.new/, error.message)
    assert_match(/file_name:/, error.message)
  end

  def test_file_object_without_file_name_raises
    client = PhaseoSdk::Phaseo.new(api_key: "test", enable_deprecation_warnings: false)
    assert_raises(ArgumentError) do
      client.generate_transcription("model" => "example/transcribe-1", "file" => { content: "bytes".b })
    end
  end

  def test_upload_file_sends_multipart_with_model_and_provider_query
    jsonl = "{\"custom_id\":\"a\"}\n"
    result, captured = with_server('{"id":"file_123","purpose":"batch"}') do |client|
      client.upload_file(
        "purpose" => "batch",
        "file" => { "file_name" => "input.jsonl", "content" => jsonl, "content_type" => "application/jsonl" },
        "model" => "example/chat-1",
        "provider" => "example"
      )
    end

    assert_equal "file_123", result["id"]
    assert_equal "POST /v1/batches/files?model=example%2Fchat-1&provider=example HTTP/1.1", captured.request_line
    assert_match %r{\Amultipart/form-data; boundary=}, captured.headers["content-type"]
    parts = parse_multipart(captured)
    file = parts.find { |part| part[:name] == "file" }
    assert_equal "input.jsonl", file[:filename]
    assert_equal "application/jsonl", file[:content_type]
    assert_equal jsonl, file[:value]
    assert_equal [["purpose", "batch"]], parts.reject { |part| part[:name] == "file" }.map { |part| [part[:name], part[:value]] }
  end
end
