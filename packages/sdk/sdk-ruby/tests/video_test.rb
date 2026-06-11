require "minitest/autorun"
require_relative "../lib/index"

class VideoTest < Minitest::Test
  def test_retrieve_video_content_returns_bytes
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request_bytes) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      "video-bytes"
    end

    content = client.retrieve_video_content("video_123")

    assert_equal "video-bytes", content
    assert_equal [["get", "/videos/video_123/content", nil, nil, nil]], calls
  end

  def test_get_video_download_url_returns_payload
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      {
        "download_url" => "https://cdn.example.test/video.mp4",
        "expires_at" => 1_723_000_000
      }
    end

    response = client.get_video_download_url("video_123", { disposition: "attachment" })

    assert_equal "https://cdn.example.test/video.mp4", response["download_url"]
    assert_equal 1_723_000_000, response["expires_at"]
    assert_equal [["POST", "/videos/video_123/download_url", nil, nil, { disposition: "attachment" }]], calls
  end

  def test_video_lifecycle_helpers_return_payloads
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      enable_deprecation_warnings: false
    )

    calls = []
    client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
      calls << [method, path, query, headers, body]
      if method == "GET" && path == "/gateway/models"
        next({
          "models" => [
            {
              "model_id" => "google/veo-3",
              "status" => "active"
            }
          ]
        })
      end
      if method == "POST" && path == "/videos"
        next({
          "id" => "video_123",
          "object" => "video",
          "status" => "queued",
          "provider" => "google",
          "request_id" => "req_ruby_video_1",
          "session_id" => "session_ruby_video_1",
          "pricing_lines" => [
            { "dimension" => "video_seconds", "units" => 8 }
          ]
        })
      end
      if method == "GET" && path == "/videos/video_123"
        next({
          "id" => "video_123",
          "object" => "video",
          "status" => "completed",
          "provider" => "google",
          "request_id" => "req_ruby_video_1",
          "session_id" => "session_ruby_video_1",
          "pricing_lines" => [
            { "dimension" => "video_seconds", "units" => 8 }
          ]
        })
      end
      if method == "POST" && path == "/videos/video_123/cancel"
        next({
          "id" => "video_123",
          "object" => "video",
          "status" => "cancelled"
        })
      end
      if method == "DELETE" && path == "/videos/video_123"
        next({
          "id" => "video_123",
          "object" => "video",
          "deleted" => true
        })
      end
      if method == "GET" && path == "/videos"
        next({
          "object" => "list",
          "data" => [
            { "id" => "video_123", "status" => "queued" },
            { "id" => "video_456", "status" => "completed" }
          ]
        })
      end
      {
        "object" => "list",
        "data" => [
          { "id" => "google/veo-3" }
        ]
      }
    end

    created = client.generate_video({ model: "google/veo-3", prompt: "orbiting camera shot" })
    retrieved = client.get_video("video_123")
    cancelled = client.cancel_video("video_123")
    deleted = client.delete_video("video_123")
    models = client.list_video_models
    list = client.list_videos({ status: "queued,completed", limit: "2" })

    assert_equal "queued", created["status"]
    assert_equal "google", created["provider"]
    assert_equal "req_ruby_video_1", created["request_id"]
    assert_equal "session_ruby_video_1", created["session_id"]
    assert_equal 1, created["pricing_lines"].length
    assert_equal "completed", retrieved["status"]
    assert_equal "google", retrieved["provider"]
    assert_equal "req_ruby_video_1", retrieved["request_id"]
    assert_equal "session_ruby_video_1", retrieved["session_id"]
    assert_equal "cancelled", cancelled["status"]
    assert_equal true, deleted["deleted"]
    assert_equal "google/veo-3", models["data"][0]["id"]
    assert_equal "video_456", list["data"][1]["id"]
    assert_equal "wss://api.phaseo.app/v1/async/video/video_123/ws?interval_ms=900", client.video_websocket_url("video_123", interval_ms: 900)
    assert_equal [
      ["GET", "/gateway/models", { "model_id" => "google/veo-3", "limit" => "1" }, nil, nil],
      ["POST", "/videos", nil, nil, { model: "google/veo-3", prompt: "orbiting camera shot" }],
      ["GET", "/videos/video_123", nil, nil, nil],
      ["POST", "/videos/video_123/cancel", nil, nil, nil],
      ["DELETE", "/videos/video_123", nil, nil, nil],
      ["GET", "/videos/models", nil, nil, nil],
      ["GET", "/videos", { status: "queued,completed", limit: "2" }, nil, nil]
    ], calls
  end
end
