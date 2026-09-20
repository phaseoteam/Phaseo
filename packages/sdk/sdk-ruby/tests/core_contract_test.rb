require "socket"
require_relative "../lib/gen/client"

responses = [
  "HTTP/1.1 503 Service Unavailable\r\nRetry-After: 0\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
  "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Request-Id: req-1\r\nX-Phaseo-Trace-Url: https://trace.test/req-1\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}",
  "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
  "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 2\r\nX-Request-Id: req-2\r\nContent-Type: application/json\r\nContent-Length: 34\r\nConnection: close\r\n\r\n{\"error\":{\"code\":\"rate_limit\"}}"
]

server = TCPServer.new("127.0.0.1", 0)
requests = []
server_thread = Thread.new do
  responses.each do |raw_response|
    socket = server.accept
    request = +""
    while (line = socket.gets)
      request << line
      break if line == "\r\n"
    end
    content_length = request[/Content-Length:\s*(\d+)/i, 1].to_i
    request << socket.read(content_length) if content_length.positive?
    requests << request
    socket.write(raw_response)
    socket.close
  end
ensure
  server.close
end

events = []
client = Phaseo::Gen::Client.new(
  base_url: "http://127.0.0.1:#{server.addr[1]}",
  max_retries: 1,
  on_request: ->(**event) { events << [:request, event] },
  on_response: ->(**event) { events << [:response, event] },
  on_retry: ->(**event) { events << [:retry, event] }
)

response = client.request_with_response(method: "GET", path: "/safe")
raise "missing response metadata" unless response.status_code == 200 && response.request_id == "req-1"
raise "missing trace URL" unless response.trace_url == "https://trace.test/req-1"
raise "missing parsed body" unless response.body == { "ok" => true }
raise "hooks did not run" unless events.count { |type, _| type == :request } == 2 && events.any? { |type, _| type == :retry }

begin
  client.request_with_response(
    method: "POST",
    path: "/write",
    body: { value: 1 },
    options: { max_retries: 3, idempotency_key: "idem-1" }
  )
  raise "POST should have failed"
rescue Phaseo::Gen::RequestError => error
  raise "unsafe POST was retried" unless error.status_code == 503
end

begin
  client.request_with_response(method: "GET", path: "/error", options: { max_retries: 0 })
  raise "request should have failed"
rescue Phaseo::Gen::RequestError => error
  raise "missing error code" unless error.code == "rate_limit"
  raise "missing request ID" unless error.request_id == "req-2"
  raise "missing retry-after" unless error.retry_after == "2"
end

server_thread.join
raise "missing idempotency header" unless requests[2].downcase.include?("idempotency-key: idem-1")

begin
  client.request_with_response(method: "GET", path: "/invalid", options: { max_retries: -1 })
  raise "negative retries should fail"
rescue ArgumentError
  nil
end

puts "ruby core contract tests ok"
