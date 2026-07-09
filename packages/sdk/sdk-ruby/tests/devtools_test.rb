require "minitest/autorun"
require "tmpdir"
require_relative "../lib/index"

class DevtoolsTest < Minitest::Test
  def test_records_responses_entries
    Dir.mktmpdir("phaseo-devtools-ruby-") do |dir|
      client = PhaseoSdk::Phaseo.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: PhaseoSdk::Devtools.create(enabled: true, directory: dir)
      )

      result = client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "responses",
        payload: { model: "openai/gpt-5-nano", input: "hi" },
        check_lifecycle: false
      ) do
        {
          id: "resp_1",
          model: "openai/gpt-5-nano",
          usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
          request_id: "req_ruby_1",
          session_id: "session_ruby_chat_1",
          upstream_request_id: "upstream_ruby_chat_1",
          pricing_lines: [{ provider: "openai", cost_usd: 0.0025 }],
          latency_ms: 120,
          generation_ms: 340,
          provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 460 }]
        }
      end

      assert_equal "resp_1", result[:id]

      generations = File.join(dir, "generations.jsonl")
      metadata = File.join(dir, "metadata.json")
      assert File.exist?(generations), "expected generations.jsonl to exist"
      assert File.exist?(metadata), "expected metadata.json to exist"

      content = File.read(generations)
      assert_includes content, "\"type\":\"responses\""
      assert_includes content, "\"sdk\":\"ruby\""

      entry = JSON.parse(content.lines.first)
      assert_equal "req_ruby_1", entry.dig("metadata", "request_id")
      assert_equal "session_ruby_chat_1", entry.dig("metadata", "session_id")
      assert_equal "upstream_ruby_chat_1", entry.dig("metadata", "upstream_request_id")
      assert_equal "openai", entry.dig("metadata", "pricing_lines", 0, "provider")
      assert_equal 120, entry.dig("metadata", "latency_ms")
      assert_equal "openai", entry.dig("metadata", "provider_attempts", 0, "provider")
    end
  end

  def test_records_structured_error_responses
    Dir.mktmpdir("phaseo-devtools-ruby-") do |dir|
      client = PhaseoSdk::Phaseo.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: PhaseoSdk::Devtools.create(enabled: true, directory: dir)
      )

      error = assert_raises(Phaseo::Gen::RequestError) do
        client.send(
          :with_lifecycle_and_telemetry,
          endpoint: "responses",
          payload: { model: "openai/gpt-5-nano", input: "hi" },
          check_lifecycle: false
        ) do
          raise Phaseo::Gen::RequestError.new(
            status_code: 429,
            status_message: "Too Many Requests",
            response_body: {
              request_id: "req_ruby_err_1",
              provider_attempts: [{ provider: "openrouter", status_code: 429, duration_ms: 612 }]
            }.to_json
          )
        end
      end

      assert_equal 429, error.status_code

      entry = JSON.parse(File.read(File.join(dir, "generations.jsonl")).lines.first)
      assert_equal "req_ruby_err_1", entry.dig("response", "request_id")
      assert_equal "req_ruby_err_1", entry.dig("metadata", "request_id")
      assert_equal 429, entry.dig("error", "status_code")
    end
  end

  def test_records_batch_entries
    Dir.mktmpdir("phaseo-devtools-ruby-") do |dir|
      client = PhaseoSdk::Phaseo.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: PhaseoSdk::Devtools.create(enabled: true, directory: dir)
      )

      result = client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "batches.create",
        payload: {
          input_file_id: "file_ruby_1",
          endpoint: "/v1/responses",
          completion_window: "24h",
          session_id: "session_ruby_batch_1",
          webhook: { url: "https://example.com/hooks/batch" }
        },
        check_lifecycle: false
      ) do
        {
          id: "batch_ruby_1",
          object: "batch",
          status: "completed",
          endpoint: "/v1/responses",
          provider: "openai",
          request_id: "req_ruby_batch_1",
          session_id: "session_ruby_batch_1",
          pricing_lines: [{ dimension: "batch_requests", units: 2 }],
          request_counts: { total: 2, completed: 1, failed: 1 },
          billing: { charged: true, cost_usd: 0.0025 }
        }
      end

      assert_equal "batch_ruby_1", result[:id]

      entry = JSON.parse(File.read(File.join(dir, "generations.jsonl")).lines.first)
      assert_equal "batches.create", entry["type"]
      assert_equal "session_ruby_batch_1", entry.dig("request", "session_id")
      assert_equal "https://example.com/hooks/batch", entry.dig("request", "webhook", "url")
      assert_equal "openai", entry.dig("metadata", "provider")
      assert_equal "session_ruby_batch_1", entry.dig("metadata", "session_id")
      assert_equal 2, entry.dig("metadata", "request_counts", "total")
      assert_equal true, entry.dig("metadata", "billing", "charged")
    end
  end

  def test_records_generation_lookup_entries
    Dir.mktmpdir("phaseo-devtools-ruby-") do |dir|
      client = PhaseoSdk::Phaseo.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: PhaseoSdk::Devtools.create(enabled: true, directory: dir)
      )

      result = client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "generations.retrieve",
        payload: { "id" => "gen_ruby_1" },
        check_lifecycle: false
      ) do
        {
          id: "gen_ruby_1",
          provider: "openai",
          request_id: "req_ruby_generation_1",
          session_id: "session_ruby_generation_1",
          status_code: 200
        }
      end

      assert_equal "gen_ruby_1", result[:id]

      entry = JSON.parse(File.read(File.join(dir, "generations.jsonl")).lines.first)
      assert_equal "generations.retrieve", entry["type"]
      assert_equal "gen_ruby_1", entry.dig("request", "id")
      assert_equal "req_ruby_generation_1", entry.dig("metadata", "request_id")
      assert_equal "session_ruby_generation_1", entry.dig("metadata", "session_id")
      assert_equal "openai", entry.dig("metadata", "provider")
    end
  end

  def test_records_health_entries
    Dir.mktmpdir("phaseo-devtools-ruby-") do |dir|
      client = PhaseoSdk::Phaseo.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: PhaseoSdk::Devtools.create(enabled: true, directory: dir)
      )

      client.raw_client.define_singleton_method(:request) do |method:, path:, query: nil, headers: nil, body: nil|
        if method == "GET" && path == "/health"
          { "status" => "ok", "timestamp" => "2026-05-05T12:00:00.000Z" }
        else
          raise "unexpected request #{method} #{path}"
        end
      end

      response = client.health

      assert_equal "ok", response["status"]
      entry = JSON.parse(File.read(File.join(dir, "generations.jsonl")).lines.first)
      assert_equal "health", entry["type"]
      assert_equal "ok", entry.dig("response", "status")
    end
  end

  def test_records_video_lifecycle_entries
    Dir.mktmpdir("phaseo-devtools-ruby-") do |dir|
      client = PhaseoSdk::Phaseo.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: PhaseoSdk::Devtools.create(enabled: true, directory: dir)
      )

      client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "video.generations",
        payload: { model: "google/veo-3", prompt: "orbital reveal" },
        check_lifecycle: false
      ) do
        {
          id: "video_ruby_1",
          object: "video",
          status: "queued",
          provider: "google",
          model: "google/veo-3",
          request_id: "req_ruby_video_1",
          session_id: "session_ruby_video_1"
        }
      end

      client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "video.retrieve",
        payload: { "video_id" => "video_ruby_1" },
        check_lifecycle: false
      ) do
        {
          id: "video_ruby_1",
          object: "video",
          status: "completed",
          provider: "google",
          model: "google/veo-3",
          request_id: "req_ruby_video_2",
          session_id: "session_ruby_video_2"
        }
      end

      client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "video.cancel",
        payload: { "video_id" => "video_ruby_1" },
        check_lifecycle: false
      ) do
        {
          id: "video_ruby_1",
          object: "video",
          status: "cancelled",
          provider: "google",
          model: "google/veo-3",
          request_id: "req_ruby_video_3",
          session_id: "session_ruby_video_3"
        }
      end

      lines = File.read(File.join(dir, "generations.jsonl")).lines
      assert_equal 3, lines.length

      create_entry = JSON.parse(lines[0])
      assert_equal "video.generations", create_entry["type"]
      assert_equal "req_ruby_video_1", create_entry.dig("metadata", "request_id")

      retrieve_entry = JSON.parse(lines[1])
      assert_equal "video.retrieve", retrieve_entry["type"]
      assert_equal "video_ruby_1", retrieve_entry.dig("request", "video_id")
      assert_equal "session_ruby_video_2", retrieve_entry.dig("metadata", "session_id")

      cancel_entry = JSON.parse(lines[2])
      assert_equal "video.cancel", cancel_entry["type"]
      assert_equal "req_ruby_video_3", cancel_entry.dig("metadata", "request_id")
    end
  end

  def test_records_control_plane_entries
    Dir.mktmpdir("phaseo-devtools-ruby-") do |dir|
      client = PhaseoSdk::Phaseo.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: PhaseoSdk::Devtools.create(enabled: true, directory: dir)
      )

      client.send(:with_lifecycle_and_telemetry, endpoint: "models.list", payload: { limit: "2" }, check_lifecycle: false) do
        { "models" => [{ "model_id" => "openai/gpt-5-mini" }] }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "providers", payload: { limit: "2" }, check_lifecycle: false) do
        { "data" => [{ "slug" => "openai" }] }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "credits", payload: { team_id: "team_123" }, check_lifecycle: false) do
        { "credits" => { "remaining" => 42 } }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "activity", payload: { days: "30" }, check_lifecycle: false) do
        { "data" => [{ "date" => "2026-05-01", "requests" => 12 }] }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "analytics", payload: { date: "2026-05-01" }, check_lifecycle: false) do
        { "data" => [{ "endpoint_id" => "responses", "requests" => 9 }] }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "endpoints.list", payload: {}, check_lifecycle: false) do
        { "data" => [{ "id" => "responses" }] }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "organisations.list", payload: { limit: "2", offset: "3" }, check_lifecycle: false) do
        { "data" => [{ "id" => "org_ruby_1" }] }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "pricing.models", payload: { provider: "openai" }, check_lifecycle: false) do
        { "data" => [{ "model_id" => "openai/gpt-5-mini" }] }
      end
      client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "pricing.calculate",
        payload: { provider: "openai", model: "openai/gpt-5-mini", endpoint: "responses" },
        check_lifecycle: false
      ) do
        { "pricing" => { "currency" => "USD", "total_cost_usd" => 0.0031 } }
      end
      client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "provisioning.keys.list",
        payload: { disabled: "true", limit: "2" },
        check_lifecycle: false
      ) do
        { "data" => [{ "id" => "key_ruby_1" }] }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "key.current", payload: {}, check_lifecycle: false) do
        { "data" => { "id" => "key_ruby_current_1", "status" => "active" } }
      end
      client.send(:with_lifecycle_and_telemetry, endpoint: "provisioning.workspaces.list", payload: { limit: "2" }, check_lifecycle: false) do
        { "data" => [{ "id" => "ws_ruby_1" }] }
      end

      lines = File.read(File.join(dir, "generations.jsonl")).lines
      assert_equal 12, lines.length

      expected_types = [
        "models.list",
        "providers",
        "credits",
        "activity",
        "analytics",
        "endpoints.list",
        "organisations.list",
        "pricing.models",
        "pricing.calculate",
        "provisioning.keys.list",
        "key.current",
        "provisioning.workspaces.list"
      ]

      expected_types.each_with_index do |expected_type, index|
        entry = JSON.parse(lines[index])
        assert_equal expected_type, entry["type"]
      end

      analytics_entry = JSON.parse(lines[4])
      assert_equal "responses", analytics_entry.dig("response", "data", 0, "endpoint_id")

      pricing_entry = JSON.parse(lines[8])
      assert_equal "USD", pricing_entry.dig("response", "pricing", "currency")

      current_key_entry = JSON.parse(lines[10])
      assert_equal "key_ruby_current_1", current_key_entry.dig("response", "data", "id")

      workspaces_entry = JSON.parse(lines[11])
      assert_equal "ws_ruby_1", workspaces_entry.dig("response", "data", 0, "id")
    end
  end
end
