require "minitest/autorun"
require_relative "../lib/index"

class ChatTest < Minitest::Test
  def test_generate_text_preserves_gateway_metadata
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      if method == "GET" && path == "/models"
        next({
          "models" => [
            {
              "model_id" => "openai/gpt-5-nano",
              "status" => "active"
            }
          ]
        })
      end
      {
        "id" => "req_ruby_chat_1",
        "nativeResponseId" => "chatcmpl_ruby_1",
        "object" => "chat.completion",
        "created" => 1_723_000_000,
        "model" => "openai/gpt-5-nano",
        "provider" => "openai",
        "session_id" => "session_ruby_chat_1",
        "upstream_request_id" => "upstream_ruby_chat_1",
        "provider_attempts" => [
          { "provider" => "openai", "status_code" => 200, "duration_ms" => 412 }
        ],
        "pricing_lines" => [
          { "provider" => "openai", "cost_usd" => 0.0025 }
        ],
        "usage" => {
          "input_tokens" => 2,
          "output_tokens" => 1,
          "total_tokens" => 3
        },
        "choices" => [
          {
            "index" => 0,
            "message" => { "role" => "assistant", "content" => "hi" },
            "finish_reason" => "stop"
          }
        ]
      }
    end

    response = client.generate_text(
      {
        model: "openai/gpt-5-nano",
        messages: [{ role: "user", content: "hi" }]
      }
    )

    assert_equal "openai", response["provider"]
    assert_equal "chatcmpl_ruby_1", response["nativeResponseId"]
    assert_equal "session_ruby_chat_1", response["session_id"]
    assert_equal "upstream_ruby_chat_1", response["upstream_request_id"]
    assert_equal "openai", response.dig("provider_attempts", 0, "provider")
    assert_equal "openai", response.dig("pricing_lines", 0, "provider")
    assert_equal 2, response["usage"]["input_tokens"]
    assert_equal 1, response["usage"]["output_tokens"]
    assert_equal 3, response["usage"]["total_tokens"]
    assert_equal [
      ["GET", "/models", { "model_id" => "openai/gpt-5-nano", "limit" => "1" }, nil, nil],
      ["POST", "/chat/completions", nil, nil, { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "hi" }] }]
    ], calls
  end
end
