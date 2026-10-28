require "minitest/autorun"
require "json"
require "socket"
require_relative "../lib/index"

ENDED = {
  "type" => "session.ended", "session_id" => "rt_test", "reason" => "client_requested", "initiated_by" => "client",
  "duration_seconds" => 12.5, "usage" => { "output_audio_tokens" => 200 },
  "cost" => { "total_usd" => 0.01, "total_nanos" => 10_000_000, "estimated" => false, "estimate_basis" => nil,
              "debt_nanos" => 0, "uncollected_nanos" => 0, "currency" => "USD" },
  "billing_status" => "settled"
}.freeze

# In-memory relay socket: records what the session writes and lets the test play the relay.
class FakeRelaySocket
  attr_reader :sent, :url, :protocols, :close_code, :close_reason, :closed_with
  attr_accessor :on_write

  def initialize(url, protocols)
    @url = url
    @protocols = protocols
    @sent = []
    @inbox = Queue.new
    @close_code = nil
    @close_reason = ""
    receive("type" => "relay.connected", "session_id" => "rt_test")
  end

  def receive(event)
    @inbox << JSON.generate(event)
  end

  def server_close(code, reason = "")
    @close_code = code
    @close_reason = reason
    @inbox << nil
  end

  def write_text(text)
    message = JSON.parse(text)
    @sent << message
    on_write&.call(message, self)
  end

  def read_text
    @inbox.pop
  end

  def close(code, reason)
    @closed_with = [code, reason]
    server_close(code, reason)
  end
end

class RealtimeTest < Minitest::Test
  def client_with(created)
    client = PhaseoSdk::Phaseo.new(api_key: "sk_test_123", enable_deprecation_warnings: false)
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      created << [method, path, body]
      {
        "id" => "rt_test", "session_id" => "rt_test", "client_secret" => "rtsec_secret",
        "connect" => { "transport" => "websocket", "url" => "/v1/realtime/sessions/rt_test/relay" },
        "max_duration_seconds" => 3600
      }
    end
    client
  end

  def connect(created = [])
    socket = nil
    transport = lambda do |url, protocols, _timeout|
      socket = FakeRelaySocket.new(url, protocols)
    end
    session = client_with(created).realtime.connect(model: "openai/gpt-realtime-2", voice: "marin", transport: transport)
    [session, socket]
  end

  def test_connect_sends_audio_streams_events_and_end_returns_the_bill
    created = []
    session, socket = connect(created)
    assert_equal [["POST", "/audio/realtime/sessions", { "model" => "openai/gpt-realtime-2", "voice" => "marin" }]], created
    assert_equal "wss://api.phaseo.app/v1/realtime/sessions/rt_test/relay", socket.url
    assert_equal ["statsync-realtime", "rtsec.rtsec_secret"], socket.protocols
    assert_equal "rt_test", session.id
    refute session.info.key?("client_secret")

    warnings = []
    session.on_warning { |event| warnings << event }
    seen = []
    reader = Thread.new do
      session.each_event do |event|
        seen << event["type"]
        break if seen.size == 2
      end
    end
    sleep 0.05
    session.send_audio([0, 1, 2, 255].pack("C*"))
    socket.receive("type" => "response.output_audio.delta", "delta" => "AAA=")
    socket.receive("type" => "session.warning", "code" => "max_duration_approaching", "seconds_remaining" => 120)
    reader.join(5)
    assert_equal ["response.output_audio.delta", "session.warning"], seen
    assert_equal 120, warnings.first["seconds_remaining"]

    socket.on_write = lambda do |message, relay|
      next unless message["type"] == "session.end"

      relay.receive(ENDED)
      relay.server_close(1000)
    end
    ended = session.end(reason: "caller hung up", cancel_response: false, timeout: 5)
    assert_equal "client_requested", ended["reason"]
    assert_equal 0.01, ended["cost"]["total_usd"]
    assert_equal({ "type" => "client.audio", "audio" => "AAEC/w==" }, socket.sent.first)
    assert_equal({ "type" => "session.end", "reason" => "caller hung up", "cancel_response" => false }, socket.sent.last)
    assert_same ended, session.end
  end

  def test_end_raises_with_final_bill_when_socket_closes_without_session_ended
    session, socket = connect
    socket.on_write = ->(message, relay) { relay.server_close(1011, "realtime_client_socket_error") if message["type"] == "session.end" }
    error = assert_raises(PhaseoSdk::RealtimeSessionClosedError) { session.end }
    assert_equal 1011, error.close_code
    assert_equal "/v1/generations?id=realtime%3Art_test", error.final_bill_path
    assert_includes error.message, "GET /v1/generations?id=realtime%3Art_test"
  end

  def test_end_times_out_and_closes_the_socket
    session, socket = connect
    error = assert_raises(PhaseoSdk::RealtimeSessionClosedError) { session.end(timeout: 0.05) }
    assert_includes error.message, "timed out after 0.05 s"
    assert_equal [1000, "client_closed"], socket.closed_with
  end

  def test_provider_ended_session_is_returned_by_wait
    session, socket = connect
    socket.receive(ENDED.merge("reason" => "max_duration_reached", "initiated_by" => "gateway"))
    socket.server_close(1000)
    assert_equal "max_duration_reached", session.wait(timeout: 5)["reason"]
  end

  def test_interrupting_connect_before_relay_connected_closes_the_socket
    socket = nil
    opened = Queue.new
    transport = lambda do |url, protocols, _timeout|
      socket = FakeRelaySocket.new(url, protocols)
      socket.read_text # Swallow relay.connected so the session keeps waiting.
      opened << true
      socket
    end
    caller = Thread.new do
      client_with([]).realtime.connect(model: "openai/gpt-realtime-2", transport: transport)
    rescue Interrupt
      :interrupted
    end
    opened.pop
    sleep 0.05
    caller.raise(Interrupt)
    assert_equal :interrupted, caller.value
    assert_equal [1000, "client_closed"], socket.closed_with
  end

  def test_relay_url_resolves_relative_connect_urls
    assert_equal "ws://localhost:8787/v1/realtime/sessions/rt_x/relay",
                 PhaseoSdk::Realtime.relay_url("http://localhost:8787/v1", "/v1/realtime/sessions/rt_x/relay")
  end

  # Exercises the built-in transport against a local relay; needs the optional `websocket` gem.
  def test_websocket_transport_against_local_relay
    begin
      require "websocket"
    rescue LoadError
      skip "websocket gem not installed"
    end
    server = TCPServer.new("127.0.0.1", 0)
    port = server.addr[1]
    received = Queue.new
    relay = Thread.new do
      client = server.accept
      handshake = WebSocket::Handshake::Server.new
      request = +""
      request << client.readpartial(1) until request.end_with?("\r\n\r\n")
      handshake << request
      received << handshake.headers["sec-websocket-protocol"]
      response = handshake.to_s.sub("\r\n\r\n", "\r\nSec-WebSocket-Protocol: statsync-realtime\r\n\r\n")
      client.write(response)
      send_text = ->(data) { client.write(WebSocket::Frame::Outgoing::Server.new(version: handshake.version, data: data, type: :text).to_s) }
      send_text.call(JSON.generate("type" => "relay.connected"))
      incoming = WebSocket::Frame::Incoming::Server.new(version: handshake.version)
      loop do
        incoming << client.readpartial(4096)
        while (frame = incoming.next)
          message = JSON.parse(frame.data.to_s)
          received << message
          next unless message["type"] == "session.end"

          send_text.call(JSON.generate(ENDED))
          client.write(WebSocket::Frame::Outgoing::Server.new(version: handshake.version, data: "", type: :close, code: 1000).to_s)
          sleep 0.1
          client.close
          Thread.exit
        end
      end
    end
    client = PhaseoSdk::Phaseo.new(api_key: "sk_test_123", base_path: "http://127.0.0.1:#{port}/v1", enable_deprecation_warnings: false)
    client.raw_client.define_singleton_method(:request) do |**|
      { "session_id" => "rt_test", "client_secret" => "rtsec_secret", "connect" => { "url" => "/v1/realtime/sessions/rt_test/relay" } }
    end
    session = client.realtime.connect(model: "openai/gpt-realtime-2")
    assert_equal "statsync-realtime, rtsec.rtsec_secret", received.pop
    session.send_audio("\x00\x01".b)
    assert_equal({ "type" => "client.audio", "audio" => "AAE=" }, received.pop)
    assert_equal "settled", session.end(timeout: 5)["billing_status"]
    relay.join(5)
  ensure
    server&.close
  end
end
