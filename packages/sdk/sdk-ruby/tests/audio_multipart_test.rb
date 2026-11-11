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

  def test_transcription_with_file_sends_multipart
    audio = "RIFF\x00\x01fake-wav-bytes".b
    result, captured = with_server('{"text":"hello"}') do |client|
      client.generate_transcription(
        "model" => "openai/gpt-4o-transcribe",
        "file" => audio,
        "filename" => "clip.wav",
        "language" => "en",
        "temperature" => 0.2,
        "stream" => false,
        "timestamp_granularities" => ["word", "segment"],
        "provider" => { "order" => ["openai"] }
      )
    end

    assert_equal "hello", result["text"]
    assert_equal "POST /v1/audio/transcriptions HTTP/1.1", captured.request_line
    assert_match %r{\Amultipart/form-data; boundary=}, captured.headers["content-type"]
    parts = parse_multipart(captured)
    file = parts.find { |part| part[:name] == "file" }
    refute_nil file, "file part missing"
    assert_equal "clip.wav", file[:filename]
    assert_equal "audio/wav", file[:content_type]
    assert_equal audio, file[:value]
    fields = parts.reject { |part| part[:name] == "file" }.to_h { |part| [part[:name], part[:value]] }
    assert_equal "openai/gpt-4o-transcribe", fields["model"]
    assert_equal "en", fields["language"]
    assert_equal "0.2", fields["temperature"]
    assert_equal "false", fields["stream"]
    assert_equal '["word","segment"]', fields["timestamp_granularities"]
    assert_equal '{"order":["openai"]}', fields["provider"]
    refute fields.key?("filename")
  end

  def test_transcription_with_url_only_sends_json
    _result, captured = with_server('{"text":"hello"}') do |client|
      client.generate_transcription("model" => "openai/whisper-1", "file_url" => "https://example.com/a.mp3")
    end

    assert_equal "application/json", captured.headers["content-type"]
    assert_equal({ "model" => "openai/whisper-1", "file_url" => "https://example.com/a.mp3" }, JSON.parse(captured.body))
  end

  def test_translation_with_path_sends_multipart_with_file_name
    Dir.mktmpdir do |dir|
      path = File.join(dir, "speech.ogg")
      File.binwrite(path, "OggS-bytes".b)
      _result, captured = with_server('{"text":"hi"}') do |client|
        client.generate_translation(model: "openai/whisper-1", file: Pathname.new(path))
      end

      assert_equal "POST /v1/audio/translations HTTP/1.1", captured.request_line
      assert_match %r{\Amultipart/form-data; boundary=}, captured.headers["content-type"]
      parts = parse_multipart(captured)
      file = parts.find { |part| part[:name] == "file" }
      assert_equal "speech.ogg", file[:filename]
      assert_equal "audio/ogg", file[:content_type]
      assert_equal "OggS-bytes".b, file[:value]
      assert_equal "openai/whisper-1", parts.find { |part| part[:name] == "model" }[:value]
    end
  end

  def test_translation_with_io_uses_default_filename
    _result, captured = with_server('{"text":"hi"}') do |client|
      client.create_translation("model" => "openai/whisper-1", "file" => StringIO.new("mp3-bytes"))
    end

    file = parse_multipart(captured).find { |part| part[:name] == "file" }
    assert_equal "audio.mp3", file[:filename]
    assert_equal "audio/mpeg", file[:content_type]
    assert_equal "mp3-bytes", file[:value]
  end

  def test_upload_file_sends_multipart_with_model_and_provider_query
    jsonl = "{\"custom_id\":\"a\"}\n"
    result, captured = with_server('{"id":"file_123","purpose":"batch"}') do |client|
      client.upload_file(
        "purpose" => "batch",
        "file" => jsonl,
        "filename" => "input.jsonl",
        "model" => "openai/gpt-5-mini",
        "provider" => "openai"
      )
    end

    assert_equal "file_123", result["id"]
    assert_equal "POST /v1/batches/files?model=openai%2Fgpt-5-mini&provider=openai HTTP/1.1", captured.request_line
    assert_match %r{\Amultipart/form-data; boundary=}, captured.headers["content-type"]
    parts = parse_multipart(captured)
    file = parts.find { |part| part[:name] == "file" }
    assert_equal "input.jsonl", file[:filename]
    assert_equal jsonl, file[:value]
    assert_equal [["purpose", "batch"]], parts.reject { |part| part[:name] == "file" }.map { |part| [part[:name], part[:value]] }
  end
end
