# Realtime voice sessions over the Phaseo relay WebSocket.
#
# client.realtime.connect creates the session, opens the relay socket and waits for
# relay.connected. Provider events pass through unchanged as Hashes, and
# session.end returns the session.ended final bill. The socket uses the optional
# `websocket` gem (frame and handshake parsing) over Ruby's own TCP/TLS sockets.
require "json"
require "uri"
require "monitor"
require "socket"

module PhaseoSdk
  # The socket closed, or end timed out, without session.ended. The call is still billed;
  # final_bill_path returns the cost once it is settled.
  class RealtimeSessionClosedError < StandardError
    attr_reader :session_id, :close_code, :close_reason, :final_bill_path

    def initialize(session_id, close_code: nil, close_reason: "", detail: nil)
      @session_id = session_id
      @close_code = close_code
      @close_reason = close_reason.to_s
      @final_bill_path = Realtime.final_bill_path(session_id)
      detail ||= "closed (code #{close_code || 'none'}#{@close_reason.empty? ? '' : ", #{@close_reason}"})"
      super("Realtime session #{session_id} #{detail} without session.ended. The call is still billed; fetch the final bill with GET #{@final_bill_path}")
    end
  end

  # client.realtime: realtime voice sessions (beta).
  class Realtime
    # The relay echoes this protocol back; WebSocket clients need one selected.
    RELAY_PROTOCOL = "statsync-realtime".freeze

    def self.final_bill_path(session_id)
      "/v1/generations?id=#{URI.encode_www_form_component("realtime:#{session_id}")}"
    end

    # Resolves the session's connect.url against the base URL as ws:// or wss://.
    def self.relay_url(base_path, connect_url)
      resolved = URI.join("#{base_path.sub(%r{/+\z}, '')}/", connect_url).to_s
      resolved.sub(/\Ahttps:/, "wss:").sub(/\Ahttp:/, "ws:")
    end

    def initialize(client, base_path)
      @client = client
      @base_path = base_path
    end

    # Creates the session, opens the relay socket and waits for relay.connected.
    # transport: optional callable (url, protocols, timeout) -> socket with write_text, read_text, close.
    def connect(model:, voice: nil, instructions: nil, provider: nil, metadata: nil, connect_timeout: 30, transport: nil)
      body = { "model" => model }
      body["voice"] = voice if voice
      body["instructions"] = instructions if instructions
      body["provider"] = provider if provider
      body["metadata"] = metadata if metadata
      info = @client.raw_client.request(method: "POST", path: "/audio/realtime/sessions", body: body)
      secret = info["client_secret"].to_s
      session_id = (info["session_id"] || info["id"]).to_s
      connect_url = (info["connect"] || {})["url"].to_s
      if secret.empty? || session_id.empty? || connect_url.empty?
        raise ArgumentError, "Realtime session response is missing session_id, client_secret or connect.url"
      end

      opener = transport || WebSocketTransport.method(:open)
      socket = opener.call(self.class.relay_url(@base_path, connect_url), [RELAY_PROTOCOL, "rtsec.#{secret}"], connect_timeout)
      session = RealtimeSession.new(session_id, info, socket)
      session.wait_connected(connect_timeout)
      session
    end
  end

  # A connected realtime voice call.
  class RealtimeSession
    attr_reader :id, :info

    def initialize(id, info, socket)
      @id = id
      @info = info.reject { |key, _| %w[client_secret clientSecret].include?(key) }
      @socket = socket
      @listeners = Hash.new { |hash, key| hash[key] = [] }
      @queues = []
      @lock = Monitor.new
      @changed = @lock.new_cond
      @write_lock = Mutex.new
      @connected = false
      @outcome = nil
      @reader = Thread.new { read_loop }
      @reader.report_on_exception = false
    end

    # Sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google) as client.audio.
    def send_audio(pcm16)
      send_event({ "type" => "client.audio", "audio" => [pcm16.to_s.b].pack("m0") })
    end

    # Sends any event as JSON, for provider-specific messages.
    def send_event(event)
      raise IOError, "Realtime session #{@id} is not open" if finished?

      @write_lock.synchronize { @socket.write_text(JSON.generate(event)) }
    end

    # Subscribes to one event type, or every event with "*". Returns a Proc that unsubscribes.
    # Listeners run on the reader thread; keep them quick.
    def on(type, &listener)
      @lock.synchronize { @listeners[type] << listener }
      -> { @lock.synchronize { @listeners[type].delete(listener) } }
    end

    def on_warning(&listener)
      on("session.warning", &listener)
    end

    def on_ended(&listener)
      on("session.ended", &listener)
    end

    # Yields every event from now until the socket closes. Without a block, returns an Enumerator.
    def each_event
      return enum_for(:each_event) unless block_given?

      queue = Queue.new
      @lock.synchronize do
        if finished?
          queue << :closed
        else
          @queues << queue
        end
      end
      begin
        loop do
          event = queue.pop
          break if event == :closed

          yield event
        end
      ensure
        @lock.synchronize { @queues.delete(queue) }
      end
    end

    # Sends session.end and returns session.ended: reason, initiated_by, duration_seconds, usage,
    # cost, billing_status and, unless settled, final_bill. Raises RealtimeSessionClosedError if the
    # socket closes, or the timeout passes, without it.
    def end(reason: nil, cancel_response: nil, timeout: 60)
      unless finished?
        message = { "type" => "session.end" }
        message["reason"] = reason unless reason.nil?
        message["cancel_response"] = cancel_response unless cancel_response.nil?
        begin
          send_event(message)
        rescue IOError, SystemCallError
          # The socket is closing; the reader reports how it ended.
        end
      end
      unless wait_finished(timeout)
        finish(RealtimeSessionClosedError.new(@id, detail: "timed out after #{timeout} s"))
        close
      end
      wait
    end

    # Waits for the call to end however it ends and returns session.ended, or raises
    # RealtimeSessionClosedError if the socket closed without it.
    def wait(timeout: nil)
      raise RealtimeSessionClosedError.new(@id, detail: "is still running after #{timeout} s") unless wait_finished(timeout)

      outcome = @lock.synchronize { @outcome }
      raise outcome if outcome.is_a?(Exception)

      outcome
    end

    # Closes the socket without waiting for the bill. The call is still billed; prefer end.
    def close
      @socket.close(1000, "client_closed")
    rescue StandardError
      nil
    end

    # @api private
    def wait_connected(timeout)
      deadline = monotonic + timeout
      @lock.synchronize do
        until @connected || @outcome
          remaining = deadline - monotonic
          break if remaining <= 0

          @changed.wait(remaining)
        end
        return if @connected
      end
      outcome = @lock.synchronize { @outcome }
      raise outcome if outcome.is_a?(Exception)
      raise IOError, "Realtime session #{@id} ended before connecting: #{outcome['reason']}" if outcome

      close
      raise IOError, "Realtime session #{@id} did not connect within #{timeout} s"
    end

    private

    def finished?
      @lock.synchronize { !@outcome.nil? }
    end

    def wait_finished(timeout)
      deadline = timeout && monotonic + timeout
      @lock.synchronize do
        until @outcome
          if deadline
            remaining = deadline - monotonic
            return false if remaining <= 0

            @changed.wait(remaining)
          else
            @changed.wait
          end
        end
        true
      end
    end

    def read_loop
      loop do
        text = @socket.read_text
        if text.nil?
          finish(RealtimeSessionClosedError.new(@id, close_code: @socket.close_code, close_reason: @socket.close_reason))
          return
        end
        dispatch(text)
      end
    rescue StandardError => error
      finish(RealtimeSessionClosedError.new(@id, close_code: nil, close_reason: error.message))
    end

    def dispatch(text)
      event = JSON.parse(text)
      return unless event.is_a?(Hash) && event["type"].is_a?(String)

      type = event["type"]
      listeners, queues = @lock.synchronize { [@listeners[type] + @listeners["*"], @queues.dup] }
      listeners.each do |listener|
        listener.call(event)
      rescue StandardError
        nil # Listener errors must not break the session.
      end
      queues.each { |queue| queue << event }
      if type == "relay.connected"
        @lock.synchronize do
          @connected = true
          @changed.broadcast
        end
      elsif type == "session.ended"
        finish(event)
      end
    rescue JSON::ParserError
      nil
    end

    def finish(outcome)
      @lock.synchronize do
        return if @outcome

        @outcome = outcome
        @queues.each { |queue| queue << :closed }
        @changed.broadcast
      end
    end

    def monotonic
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end
  end

  # Relay socket built on the `websocket` gem's handshake and frame parsers.
  class WebSocketTransport
    attr_reader :close_code, :close_reason

    def self.open(url, protocols, timeout)
      begin
        require "websocket"
      rescue LoadError
        raise LoadError, "Realtime sessions need the 'websocket' gem. Install it with `gem install websocket` or add `gem \"websocket\"` to your Gemfile."
      end
      new(url, protocols, timeout)
    end

    def initialize(url, protocols, timeout)
      uri = URI.parse(url)
      secure = uri.scheme == "wss"
      tcp = Socket.tcp(uri.host, uri.port || (secure ? 443 : 80), connect_timeout: timeout)
      @io = secure ? tls(tcp, uri.host) : tcp
      handshake = ::WebSocket::Handshake::Client.new(url: url, protocols: protocols)
      @io.write(handshake.to_s)
      response = +""
      response << @io.readpartial(1) until response.end_with?("\r\n\r\n")
      handshake << response
      raise IOError, "Realtime relay handshake failed: #{handshake.error || response.lines.first.to_s.strip}" unless handshake.finished? && handshake.valid?

      @version = handshake.version
      @incoming = ::WebSocket::Frame::Incoming::Client.new(version: @version)
      @close_code = nil
      @close_reason = ""
    end

    def write_text(text)
      @io.write(::WebSocket::Frame::Outgoing::Client.new(version: @version, data: text, type: :text).to_s)
    end

    # Returns the next text message, or nil once the socket has closed.
    def read_text
      loop do
        while (frame = @incoming.next)
          case frame.type
          when :text then return frame.data.to_s.dup.force_encoding("UTF-8")
          when :ping then write_frame(:pong, frame.data.to_s)
          when :close
            @close_code = frame.code
            @close_reason = frame.data.to_s
            write_frame(:close, "", code: 1000) rescue nil
            @io.close rescue nil
            return nil
          end
        end
        @incoming << @io.readpartial(64 * 1024)
      end
    rescue EOFError, IOError, SystemCallError
      nil
    end

    def close(code = 1000, reason = "")
      write_frame(:close, reason, code: code)
    rescue IOError, SystemCallError
      nil
    end

    private

    def write_frame(type, data, code: nil)
      @io.write(::WebSocket::Frame::Outgoing::Client.new(version: @version, data: data, type: type, code: code).to_s)
    end

    def tls(tcp, host)
      require "openssl"
      context = OpenSSL::SSL::SSLContext.new
      context.set_params(verify_mode: OpenSSL::SSL::VERIFY_PEER)
      ssl = OpenSSL::SSL::SSLSocket.new(tcp, context)
      ssl.hostname = host
      ssl.sync_close = true
      ssl.connect
      ssl.post_connection_check(host)
      ssl
    end
  end
end
