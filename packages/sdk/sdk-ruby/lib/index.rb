require "json"
require "time"
require "fileutils"
require "securerandom"
require_relative "gen/client"
require_relative "gen/models"
require_relative "gen/operations"

module AIStatsSdk
  # Thin wrapper around the in-house generated Ruby SDK.
  # Regenerate with: `pnpm openapi:gen:ruby`
  class AIStats
    attr_reader :raw_client

    def initialize(
      api_key: nil,
      base_path: "https://api.phaseo.app/v1",
      enable_deprecation_warnings: true,
      warnings_as_errors: false,
      logger: nil,
      lifecycle_resolver: nil,
      devtools: nil
    )
      api_key ||= ENV["AI_STATS_API_KEY"]
      raise ArgumentError, "Missing API key. Pass api_key or set AI_STATS_API_KEY." if api_key.to_s.empty?

      @raw_client = AiStats::Gen::Client.new(
        base_url: base_path,
        headers: { "Authorization" => "Bearer #{api_key}" }
      )
      @enable_deprecation_warnings = enable_deprecation_warnings
      @warnings_as_errors = warnings_as_errors
      @logger = logger
      @lifecycle_resolver = lifecycle_resolver
      @warned_models = {}
      @model_lifecycle_cache = {}
      @telemetry_recorder = TelemetryRecorder.new(devtools, "1.1.0")
    end

    def get_model_deprecation_info(model_id)
      normalized = as_trimmed_string(model_id)
      return nil unless normalized
      return @model_lifecycle_cache[normalized] if @model_lifecycle_cache.key?(normalized)

      info = resolve_model_lifecycle(normalized)
      @model_lifecycle_cache[normalized] = info
      info
    end

    def validate_model(model_id)
      info = get_model_deprecation_info(model_id)
      return { ok: true, info: nil } unless info
      return { ok: false, info: info, reason: info[:message] || %(Model "#{model_id}" is retired.) } if info[:status] == "retired"

      { ok: true, info: info }
    end

    def generate_text(payload)
      with_lifecycle_and_telemetry(endpoint: "chat.completions", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createChatCompletion(@raw_client, body: payload)
      end
    end

    def create_chat_completion(payload)
      generate_text(payload)
    end

    def generate_response(payload)
      with_lifecycle_and_telemetry(endpoint: "responses", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createResponse(@raw_client, body: payload)
      end
    end

    def create_response(payload)
      generate_response(payload)
    end

    def create_anthropic_message(payload)
      with_lifecycle_and_telemetry(endpoint: "messages", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createAnthropicMessage(@raw_client, body: payload)
      end
    end

    def generate_image(payload)
      with_lifecycle_and_telemetry(endpoint: "images.generations", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createImage(@raw_client, body: payload)
      end
    end

    def create_image(payload)
      generate_image(payload)
    end

    def generate_image_edit(payload)
      with_lifecycle_and_telemetry(endpoint: "images.edits", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createImageEdit(@raw_client, body: payload)
      end
    end

    def create_image_edit(payload)
      generate_image_edit(payload)
    end

    def generate_embedding(payload)
      with_lifecycle_and_telemetry(endpoint: "embeddings", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createEmbedding(@raw_client, body: payload)
      end
    end

    def create_embedding(payload)
      generate_embedding(payload)
    end

    def generate_moderation(payload)
      with_lifecycle_and_telemetry(endpoint: "moderations", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createModeration(@raw_client, body: payload)
      end
    end

    def create_moderation(payload)
      generate_moderation(payload)
    end

    def generate_speech(payload)
      with_lifecycle_and_telemetry(endpoint: "audio.speech", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createSpeech(@raw_client, body: payload)
      end
    end

    def create_speech(payload)
      generate_speech(payload)
    end

    def generate_transcription(payload)
      with_lifecycle_and_telemetry(endpoint: "audio.transcriptions", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createTranscription(@raw_client, body: payload)
      end
    end

    def create_transcription(payload)
      generate_transcription(payload)
    end

    def generate_translation(payload)
      with_lifecycle_and_telemetry(endpoint: "audio.translations", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createTranslation(@raw_client, body: payload)
      end
    end

    def create_translation(payload)
      generate_translation(payload)
    end

    def create_batch(payload)
      with_lifecycle_and_telemetry(endpoint: "batches.create", payload: payload, check_lifecycle: true) do
        AiStats::Gen::Operations.createBatch(@raw_client, body: payload)
      end
    end

    def retrieve_batch(batch_id)
      with_lifecycle_and_telemetry(endpoint: "batches.retrieve", payload: { "batch_id" => batch_id }, check_lifecycle: false) do
        AiStats::Gen::Operations.retrieveBatch(@raw_client, path: { "batch_id" => batch_id })
      end
    end

    def list_files(options = {})
      with_lifecycle_and_telemetry(endpoint: "files.list", payload: options, check_lifecycle: false) do
        AiStats::Gen::Operations.listFiles(@raw_client, query: options)
      end
    end

    def retrieve_file(file_id)
      with_lifecycle_and_telemetry(endpoint: "files.retrieve", payload: { "file_id" => file_id }, check_lifecycle: false) do
        AiStats::Gen::Operations.retrieveFile(@raw_client, path: { "file_id" => file_id })
      end
    end

    def upload_file(payload)
      with_lifecycle_and_telemetry(endpoint: "files.upload", payload: payload, check_lifecycle: false) do
        AiStats::Gen::Operations.uploadFile(@raw_client, body: payload)
      end
    end

    def list_models(options = {})
      with_lifecycle_and_telemetry(endpoint: "models.list", payload: options, check_lifecycle: false) do
        AiStats::Gen::Operations.listModels(@raw_client, query: options)
      end
    end

    def list_providers(options = {})
      with_lifecycle_and_telemetry(endpoint: "providers", payload: options, check_lifecycle: false) do
        AiStats::Gen::Operations.listProviders(@raw_client, query: options)
      end
    end

    def get_analytics(options = {})
      with_lifecycle_and_telemetry(endpoint: "analytics", payload: options, check_lifecycle: false) do
        AiStats::Gen::Operations.getAnalytics(@raw_client, query: options)
      end
    end

    def get_credits(options = {})
      with_lifecycle_and_telemetry(endpoint: "credits", payload: options, check_lifecycle: false) do
        AiStats::Gen::Operations.getCredits(@raw_client, query: options)
      end
    end

    def get_activity(options = {})
      with_lifecycle_and_telemetry(endpoint: "activity", payload: options, check_lifecycle: false) do
        AiStats::Gen::Operations.getActivity(@raw_client, query: options)
      end
    end

    def health
      with_lifecycle_and_telemetry(endpoint: "health", payload: nil, check_lifecycle: false) do
        AiStats::Gen::Operations.healthz(@raw_client)
      end
    end

    def healthz
      health
    end

    private

    def maybe_warn_for_payload(payload)
      model_id = extract_model_id(payload)
      return unless model_id
      maybe_warn_for_model(model_id)
    end

    def with_lifecycle_and_telemetry(endpoint:, payload:, check_lifecycle:)
      started_at = (Process.clock_gettime(Process::CLOCK_MONOTONIC) * 1000).to_i
      begin
        maybe_warn_for_payload(payload) if check_lifecycle
        result = yield
        duration = (Process.clock_gettime(Process::CLOCK_MONOTONIC) * 1000).to_i - started_at
        @telemetry_recorder.capture_success(endpoint: endpoint, request: payload, response: result, duration_ms: duration)
        result
      rescue StandardError => e
        duration = (Process.clock_gettime(Process::CLOCK_MONOTONIC) * 1000).to_i - started_at
        @telemetry_recorder.capture_error(endpoint: endpoint, request: payload, error: e, duration_ms: duration)
        raise
      end
    end

    def maybe_warn_for_model(model_id)
      return unless @enable_deprecation_warnings
      normalized = as_trimmed_string(model_id)
      return unless normalized

      lifecycle = get_model_deprecation_info(normalized)
      return unless lifecycle
      return if lifecycle[:status] == "active"

      message = lifecycle[:message] || build_lifecycle_message(
        lifecycle[:status],
        lifecycle[:model_id],
        lifecycle[:deprecation_date],
        lifecycle[:retirement_date],
        lifecycle[:replacement_model_id]
      )

      raise RuntimeError, message if @warnings_as_errors
      return if @warned_models[normalized]
      @warned_models[normalized] = true

      meta = {
        model_id: lifecycle[:model_id],
        status: lifecycle[:status],
        deprecation_date: lifecycle[:deprecation_date],
        retirement_date: lifecycle[:retirement_date],
        replacement_model_id: lifecycle[:replacement_model_id]
      }

      if @logger.respond_to?(:call)
        @logger.call("warn", message, meta)
      else
        warn(message)
      end
    end

    def resolve_model_lifecycle(model_id)
      if @lifecycle_resolver.respond_to?(:call)
        resolved = @lifecycle_resolver.call(model_id)
        return normalize_hash(resolved)
      end
      fetch_model_lifecycle(model_id)
    end

    def fetch_model_lifecycle(model_id)
      response = AiStats::Gen::Operations.listDataModels(
        @raw_client,
        query: { "model_id" => model_id, "limit" => "1" }
      )
      decoded = normalize_hash(response)
      return nil unless decoded
      models = decoded[:models]
      return nil unless models.is_a?(Array)

      models.each do |entry|
        model = normalize_hash(entry)
        next unless model
        next unless as_trimmed_string(model[:model_id]) == model_id

        return to_model_lifecycle_info(model, model_id)
      end
      nil
    rescue StandardError
      nil
    end

    def to_model_lifecycle_info(model, fallback_model_id)
      lifecycle = normalize_hash(model[:lifecycle]) || {}
      model_id = first_non_empty(as_trimmed_string(model[:model_id]), fallback_model_id) || fallback_model_id
      deprecation_date = first_non_empty(as_trimmed_string(lifecycle[:deprecation_date]), as_trimmed_string(model[:deprecation_date]))
      retirement_date = first_non_empty(as_trimmed_string(lifecycle[:retirement_date]), as_trimmed_string(model[:retirement_date]))
      status = normalize_lifecycle_status(
        first_non_empty(as_trimmed_string(lifecycle[:status]), as_trimmed_string(model[:status])),
        deprecation_date,
        retirement_date
      )
      replacement_model_id = first_non_empty(as_trimmed_string(lifecycle[:replacement_model_id]))
      message = first_non_empty(
        as_trimmed_string(lifecycle[:message]),
        build_lifecycle_message(status, model_id, deprecation_date, retirement_date, replacement_model_id)
      )

      {
        model_id: model_id,
        status: status,
        deprecation_date: deprecation_date,
        retirement_date: retirement_date,
        replacement_model_id: replacement_model_id,
        message: message
      }
    end

    def normalize_lifecycle_status(status, deprecation_date, retirement_date)
      normalized = as_trimmed_string(status)&.downcase
      return normalized if %w[active deprecated retired].include?(normalized)

      now = Time.now.utc
      retirement_time = parse_iso_time(retirement_date)
      return "retired" if retirement_time && retirement_time <= now

      deprecation_time = parse_iso_time(deprecation_date)
      return "deprecated" if deprecation_time && deprecation_time <= now

      "active"
    end

    def parse_iso_time(value)
      trimmed = as_trimmed_string(value)
      return nil unless trimmed
      Time.iso8601(trimmed)
    rescue ArgumentError
      nil
    end

    def build_lifecycle_message(status, model_id, deprecation_date, retirement_date, replacement_model_id)
      replacement = replacement_model_id ? %( Use "#{replacement_model_id}" instead.) : ""
      if status == "retired"
        return %[ [ai-stats] Model "#{model_id}" is retired as of #{retirement_date}.#{replacement} ].strip if retirement_date
        return %[ [ai-stats] Model "#{model_id}" is retired.#{replacement} ].strip
      end
      if status == "deprecated"
        return %[ [ai-stats] Model "#{model_id}" is deprecated and scheduled for retirement on #{retirement_date}.#{replacement} ].strip if retirement_date
        return %[ [ai-stats] Model "#{model_id}" has been deprecated since #{deprecation_date}.#{replacement} ].strip if deprecation_date
        return %[ [ai-stats] Model "#{model_id}" is deprecated.#{replacement} ].strip
      end
      ""
    end

    def extract_model_id(payload)
      decoded = normalize_hash(payload)
      return nil unless decoded
      as_trimmed_string(decoded[:model])
    end

    def normalize_hash(value)
      return symbolize_keys(value) if value.is_a?(Hash)
      if value.is_a?(String)
        parsed = JSON.parse(value)
        return symbolize_keys(parsed) if parsed.is_a?(Hash)
      end
      if value.respond_to?(:to_h)
        parsed = value.to_h
        return symbolize_keys(parsed) if parsed.is_a?(Hash)
      end
      nil
    rescue JSON::ParserError, TypeError
      nil
    end

    def symbolize_keys(hash)
      hash.each_with_object({}) do |(k, v), out|
        key = k.is_a?(Symbol) ? k : k.to_s.to_sym
        out[key] =
          case v
          when Hash
            symbolize_keys(v)
          when Array
            v.map { |item| item.is_a?(Hash) ? symbolize_keys(item) : item }
          else
            v
          end
      end
    end

    def as_trimmed_string(value)
      return nil if value.nil?
      trimmed = value.to_s.strip
      trimmed.empty? ? nil : trimmed
    end

    def first_non_empty(*values)
      values.each do |value|
        trimmed = as_trimmed_string(value)
        return trimmed if trimmed
      end
      nil
    end
  end

  module Devtools
    module_function

    def create(enabled: true, directory: nil, capture_headers: false, save_assets: true)
      {
        enabled: enabled,
        directory: directory,
        capture_headers: capture_headers,
        save_assets: save_assets
      }
    end
  end

  class TelemetryRecorder
    def initialize(config = nil, sdk_version = "1.1.0")
      config ||= {}
      enabled = config.fetch(:enabled, false)
      directory = config.fetch(:directory, ".ai-stats-devtools")
      directory = ".ai-stats-devtools" if directory.to_s.strip.empty?

      env_enabled = ENV["AI_STATS_DEVTOOLS"]
      unless env_enabled.to_s.strip.empty?
        enabled = %w[1 true yes on].include?(env_enabled.to_s.strip.downcase)
      end

      env_directory = ENV["AI_STATS_DEVTOOLS_DIR"]
      directory = env_directory.to_s.strip unless env_directory.to_s.strip.empty?

      @enabled = enabled
      @directory = directory
      @capture_headers = config.fetch(:capture_headers, false)
      @save_assets = config.fetch(:save_assets, true)
      @sdk_version = sdk_version

      return unless @enabled
      ensure_layout
      write_metadata_if_missing
    end

    def capture_success(endpoint:, request:, response:, duration_ms:)
      return unless @enabled

      metadata = {
        sdk: "ruby",
        sdk_version: @sdk_version,
        stream: false
      }
      usage = extract_usage(response)
      metadata[:usage] = usage if usage

      model, provider = extract_model_provider(response, request)
      metadata[:model] = model if model
      metadata[:provider] = provider if provider
      metadata.delete(:headers) unless @capture_headers

      entry = {
        id: new_entry_id,
        type: endpoint,
        timestamp: (Time.now.to_f * 1000).to_i,
        duration_ms: duration_ms,
        request: normalize_json_value(request),
        response: normalize_json_value(response),
        error: nil,
        metadata: metadata
      }
      append_entry(entry)
    end

    def capture_error(endpoint:, request:, error:, duration_ms:)
      return unless @enabled

      model, provider = extract_model_provider(nil, request)
      metadata = {
        sdk: "ruby",
        sdk_version: @sdk_version,
        stream: false
      }
      metadata[:model] = model if model
      metadata[:provider] = provider if provider

      entry = {
        id: new_entry_id,
        type: endpoint,
        timestamp: (Time.now.to_f * 1000).to_i,
        duration_ms: duration_ms,
        request: normalize_json_value(request),
        response: nil,
        error: { message: error.message },
        metadata: metadata
      }
      append_entry(entry)
    end

    private

    def append_entry(entry)
      ensure_layout
      File.open(File.join(@directory, "generations.jsonl"), "a:utf-8") do |file|
        file.puts(JSON.generate(entry))
      end
    rescue StandardError
      nil
    end

    def ensure_layout
      FileUtils.mkdir_p(@directory)
      return unless @save_assets
      FileUtils.mkdir_p(File.join(@directory, "assets", "images"))
      FileUtils.mkdir_p(File.join(@directory, "assets", "audio"))
      FileUtils.mkdir_p(File.join(@directory, "assets", "video"))
    end

    def write_metadata_if_missing
      path = File.join(@directory, "metadata.json")
      return if File.exist?(path)

      payload = {
        session_id: new_entry_id,
        started_at: (Time.now.to_f * 1000).to_i,
        sdk: "ruby",
        sdk_version: @sdk_version,
        platform: RUBY_PLATFORM,
        ruby_version: RUBY_VERSION
      }
      File.write(path, JSON.pretty_generate(payload))
    rescue StandardError
      nil
    end

    def extract_usage(response)
      payload = normalize_hash(response)
      return nil unless payload
      usage = payload[:usage]
      return nil unless usage.is_a?(Hash)

      prompt = usage[:prompt_tokens] || usage[:input_tokens]
      completion = usage[:completion_tokens] || usage[:output_tokens]
      total = usage[:total_tokens]

      out = {}
      out[:prompt_tokens] = prompt unless prompt.nil?
      out[:completion_tokens] = completion unless completion.nil?
      out[:total_tokens] = total unless total.nil?
      out.empty? ? nil : out
    end

    def extract_model_provider(response, request)
      response_payload = normalize_hash(response) || {}
      request_payload = normalize_hash(request) || {}

      model = as_trimmed_string(response_payload[:model]) || as_trimmed_string(request_payload[:model])
      provider = as_trimmed_string(response_payload[:provider])
      [model, provider]
    end

    def normalize_json_value(value)
      JSON.parse(JSON.generate(value), symbolize_names: false)
    rescue StandardError
      value.to_s
    end

    def normalize_hash(value)
      return symbolize_keys(value) if value.is_a?(Hash)
      if value.is_a?(String)
        parsed = JSON.parse(value)
        return symbolize_keys(parsed) if parsed.is_a?(Hash)
      end
      if value.respond_to?(:to_h)
        parsed = value.to_h
        return symbolize_keys(parsed) if parsed.is_a?(Hash)
      end
      nil
    rescue JSON::ParserError, TypeError
      nil
    end

    def symbolize_keys(hash)
      hash.each_with_object({}) do |(k, v), out|
        key = k.is_a?(Symbol) ? k : k.to_s.to_sym
        out[key] =
          case v
          when Hash
            symbolize_keys(v)
          when Array
            v.map { |item| item.is_a?(Hash) ? symbolize_keys(item) : item }
          else
            v
          end
      end
    end

    def as_trimmed_string(value)
      return nil if value.nil?
      trimmed = value.to_s.strip
      trimmed.empty? ? nil : trimmed
    end

    def new_entry_id
      "#{(Time.now.to_f * 1000).to_i}-#{SecureRandom.hex(4)}"
    end
  end

end
