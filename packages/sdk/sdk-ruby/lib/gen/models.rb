module Phaseo
  module Gen
    # @!attribute [rw] byok_usage_inference
    #   @return [Float]
    # @!attribute [rw] completion_tokens
    #   @return [Integer]
    # @!attribute [rw] date
    #   @return [String]
    # @!attribute [rw] endpoint_id
    #   @return [String]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] model_permaslug
    #   @return [String]
    # @!attribute [rw] prompt_tokens
    #   @return [Integer]
    # @!attribute [rw] provider_name
    #   @return [String]
    # @!attribute [rw] reasoning_tokens
    #   @return [Integer]
    # @!attribute [rw] requests
    #   @return [Integer]
    # @!attribute [rw] usage
    #   @return [Float]
    ActivityEntry = Struct.new(:byok_usage_inference, :completion_tokens, :date, :endpoint_id, :model, :model_permaslug, :prompt_tokens, :provider_name, :reasoning_tokens, :requests, :usage, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    ActivityResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] error
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    AnalyticsAccessTokenRequiredResponse = Struct.new(:error, :ok, keyword_init: true)
    # @!attribute [rw] message
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    # @!attribute [rw] status
    #   @return [String]
    AnalyticsNotImplementedResponse = Struct.new(:message, :ok, :status, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] limit
    #   @return [Integer]
    # @!attribute [rw] offset
    #   @return [Integer]
    # @!attribute [rw] total_count
    #   @return [Integer]
    AnalyticsResponse = Struct.new(:data, :limit, :offset, :total_count, keyword_init: true)
    # @!attribute [rw] cache_control
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] content
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] input
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] source
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] text
    #   @return [String, nil]
    # @!attribute [rw] tool_use_id
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    AnthropicContentBlock = Struct.new(:cache_control, :content, :id, :input, :name, :source, :text, :tool_use_id, :type, keyword_init: true)
    # @!attribute [rw] content
    #   @return [String, Array<Hash{String => Object}>]
    # @!attribute [rw] role
    #   @return [String]
    AnthropicMessage = Struct.new(:content, :role, keyword_init: true)
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] echo_upstream_request
    #   @return [Boolean, nil]
    # @!attribute [rw] max_tokens
    #   @return [Integer]
    # @!attribute [rw] messages
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] meta
    #   @return [Boolean, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] reasoning
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] stop_sequences
    #   @return [Array<String>, nil]
    # @!attribute [rw] stream
    #   @return [Boolean, nil]
    # @!attribute [rw] system
    #   @return [String, Array<Hash{String => Object}>, nil]
    # @!attribute [rw] temperature
    #   @return [Float, nil]
    # @!attribute [rw] tool_choice
    #   @return [Hash{String => Object}, String, nil]
    # @!attribute [rw] tools
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] top_k
    #   @return [Integer, nil]
    # @!attribute [rw] top_p
    #   @return [Float, nil]
    # @!attribute [rw] usage
    #   @return [Boolean, nil]
    AnthropicMessagesRequest = Struct.new(:debug, :echo_upstream_request, :max_tokens, :messages, :meta, :metadata, :model, :provider, :provider_options, :reasoning, :session_id, :stop_sequences, :stream, :system, :temperature, :tool_choice, :tools, :top_k, :top_p, :usage, keyword_init: true)
    # @!attribute [rw] content
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] stop_reason
    #   @return [String, nil]
    # @!attribute [rw] stop_sequence
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    AnthropicMessagesResponse = Struct.new(:content, :id, :model, :role, :stop_reason, :stop_sequence, :type, :usage, keyword_init: true)
    # @!attribute [rw] async
    #   @return [Boolean, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] input_schema
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] name
    #   @return [String]
    AnthropicTool = Struct.new(:async, :description, :input_schema, :name, keyword_init: true)
    # @!attribute [rw] input_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] output_tokens
    #   @return [Integer, nil]
    AnthropicUsage = Struct.new(:input_tokens, :output_tokens, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] creator_user_id
    #   @return [String, nil]
    # @!attribute [rw] disabled
    #   @return [Boolean]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] hash
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] include_byok_in_limit
    #   @return [Boolean]
    # @!attribute [rw] label
    #   @return [String, nil]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] limit
    #   @return [Float, nil]
    # @!attribute [rw] limit_remaining
    #   @return [Float, nil]
    # @!attribute [rw] limit_reset
    #   @return [String, nil]
    # @!attribute [rw] limits
    #   @return [Hash{String => Object}]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] scopes
    #   @return [String, Array<String>]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Float]
    # @!attribute [rw] usage_daily
    #   @return [Float]
    # @!attribute [rw] usage_details
    #   @return [Hash{String => Object}]
    # @!attribute [rw] usage_monthly
    #   @return [Float]
    # @!attribute [rw] usage_weekly
    #   @return [Float]
    # @!attribute [rw] workspace_id
    #   @return [String]
    ApiKey = Struct.new(:created_at, :created_by, :creator_user_id, :disabled, :expires_at, :hash, :id, :include_byok_in_limit, :label, :last_used_at, :limit, :limit_remaining, :limit_reset, :limits, :name, :prefix, :scopes, :soft_blocked, :status, :updated_at, :usage, :usage_daily, :usage_details, :usage_monthly, :usage_weekly, :workspace_id, keyword_init: true)
    # @!attribute [rw] disabled
    #   @return [Boolean, nil]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] include_byok_in_limit
    #   @return [Boolean, nil]
    # @!attribute [rw] limit
    #   @return [Float, nil]
    # @!attribute [rw] limit_reset
    #   @return [String, nil]
    # @!attribute [rw] limits
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] scopes
    #   @return [String, Array<String>, nil]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean, nil]
    # @!attribute [rw] workspace_id
    #   @return [String, nil]
    ApiKeyCreateRequest = Struct.new(:disabled, :expires_at, :include_byok_in_limit, :limit, :limit_reset, :limits, :name, :scopes, :soft_blocked, :workspace_id, keyword_init: true)
    # @!attribute [rw] cost
    #   @return [Float, nil]
    # @!attribute [rw] requests
    #   @return [Integer, nil]
    ApiKeyLimitBucket = Struct.new(:cost, :requests, keyword_init: true)
    # @!attribute [rw] cost
    #   @return [Float, nil]
    # @!attribute [rw] requests
    #   @return [Integer, nil]
    ApiKeyLimitInputBucket = Struct.new(:cost, :requests, keyword_init: true)
    # @!attribute [rw] daily
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] monthly
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] weekly
    #   @return [Hash{String => Object}, nil]
    ApiKeyLimitInputWindows = Struct.new(:daily, :monthly, :weekly, keyword_init: true)
    # @!attribute [rw] daily
    #   @return [Hash{String => Object}]
    # @!attribute [rw] monthly
    #   @return [Hash{String => Object}]
    # @!attribute [rw] weekly
    #   @return [Hash{String => Object}]
    ApiKeyLimitWindows = Struct.new(:daily, :monthly, :weekly, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    ApiKeyListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    ApiKeyResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] previous_key_expires_at
    #   @return [String, nil]
    ApiKeyRotateRequest = Struct.new(:name, :previous_key_expires_at, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    # @!attribute [rw] previous_key_expires_at
    #   @return [String, nil]
    ApiKeyRotateResponse = Struct.new(:data, :previous_key_expires_at, keyword_init: true)
    ApiKeyScopeValue = Object
    # @!attribute [rw] disabled
    #   @return [Boolean, nil]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] include_byok_in_limit
    #   @return [Boolean, nil]
    # @!attribute [rw] limit
    #   @return [Float, nil]
    # @!attribute [rw] limit_reset
    #   @return [String, nil]
    # @!attribute [rw] limits
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] scopes
    #   @return [String, Array<String>, nil]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean, nil]
    ApiKeyUpdateRequest = Struct.new(:disabled, :expires_at, :include_byok_in_limit, :limit, :limit_reset, :limits, :name, :scopes, :soft_blocked, keyword_init: true)
    # @!attribute [rw] cost
    #   @return [Float]
    # @!attribute [rw] requests
    #   @return [Integer]
    ApiKeyUsageBucket = Struct.new(:cost, :requests, keyword_init: true)
    # @!attribute [rw] daily
    #   @return [Hash{String => Object}]
    # @!attribute [rw] monthly
    #   @return [Hash{String => Object}]
    # @!attribute [rw] total
    #   @return [Hash{String => Object}]
    # @!attribute [rw] weekly
    #   @return [Hash{String => Object}]
    ApiKeyUsageWindows = Struct.new(:daily, :monthly, :total, :weekly, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] creator_user_id
    #   @return [String, nil]
    # @!attribute [rw] disabled
    #   @return [Boolean]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] hash
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] include_byok_in_limit
    #   @return [Boolean]
    # @!attribute [rw] key
    #   @return [String]
    # @!attribute [rw] label
    #   @return [String, nil]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] limit
    #   @return [Float, nil]
    # @!attribute [rw] limit_remaining
    #   @return [Float, nil]
    # @!attribute [rw] limit_reset
    #   @return [String, nil]
    # @!attribute [rw] limits
    #   @return [Hash{String => Object}]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] scopes
    #   @return [String, Array<String>]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Float]
    # @!attribute [rw] usage_daily
    #   @return [Float]
    # @!attribute [rw] usage_details
    #   @return [Hash{String => Object}]
    # @!attribute [rw] usage_monthly
    #   @return [Float]
    # @!attribute [rw] usage_weekly
    #   @return [Float]
    # @!attribute [rw] workspace_id
    #   @return [String]
    ApiKeyWithValue = Struct.new(:created_at, :created_by, :creator_user_id, :disabled, :expires_at, :hash, :id, :include_byok_in_limit, :key, :label, :last_used_at, :limit, :limit_remaining, :limit_reset, :limits, :name, :prefix, :scopes, :soft_blocked, :status, :updated_at, :usage, :usage_daily, :usage_details, :usage_monthly, :usage_weekly, :workspace_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    ApiKeyWithValueResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] type
    #   @return [String]
    AsyncJobWebSocketClientEvent = Struct.new(:type, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] type
    #   @return [String]
    AsyncJobWebSocketServerEvent = Struct.new(:data, :type, keyword_init: true)
    # @!attribute [rw] error
    #   @return [Hash{String => Object}, nil]
    AsyncJobWebSocketUpgradeRequiredResponse = Struct.new(:error, keyword_init: true)
    # @!attribute [rw] attempt_number
    #   @return [Integer, nil]
    # @!attribute [rw] delivered_at
    #   @return [String, nil]
    # @!attribute [rw] delivery_key
    #   @return [String, nil]
    # @!attribute [rw] error_message
    #   @return [String, nil]
    # @!attribute [rw] event_type
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] max_attempts
    #   @return [Integer, nil]
    # @!attribute [rw] next_retry_at
    #   @return [String, nil]
    # @!attribute [rw] response_body_preview
    #   @return [String, nil]
    # @!attribute [rw] response_status
    #   @return [Integer, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] tried_at
    #   @return [String, nil]
    AsyncWebhookDeliveryAttempt = Struct.new(:attempt_number, :delivered_at, :delivery_key, :error_message, :event_type, :id, :max_attempts, :next_retry_at, :response_body_preview, :response_status, :status, :tried_at, keyword_init: true)
    # @!attribute [rw] delivered_event_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] delivered_events
    #   @return [Integer, nil]
    # @!attribute [rw] last_attempt_at
    #   @return [String, nil]
    # @!attribute [rw] last_attempt_status
    #   @return [String, nil]
    # @!attribute [rw] last_delivered_at
    #   @return [String, nil]
    # @!attribute [rw] last_error_message
    #   @return [String, nil]
    # @!attribute [rw] last_failure_at
    #   @return [String, nil]
    # @!attribute [rw] last_response_status
    #   @return [Integer, nil]
    # @!attribute [rw] next_retry_at
    #   @return [String, nil]
    # @!attribute [rw] pending_retries
    #   @return [Integer, nil]
    # @!attribute [rw] total_attempts
    #   @return [Integer, nil]
    AsyncWebhookDeliverySummary = Struct.new(:delivered_event_types, :delivered_events, :last_attempt_at, :last_attempt_status, :last_delivered_at, :last_error_message, :last_failure_at, :last_response_status, :next_retry_at, :pending_retries, :total_attempts, keyword_init: true)
    # @!attribute [rw] attempts
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] delivery
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] events
    #   @return [Array<String>, nil]
    # @!attribute [rw] has_secret
    #   @return [Boolean, nil]
    # @!attribute [rw] url
    #   @return [String, nil]
    AsyncWebhookPublicState = Struct.new(:attempts, :delivery, :events, :has_secret, :url, keyword_init: true)
    # @!attribute [rw] input_audio
    #   @return [Hash{String => Object}]
    # @!attribute [rw] type
    #   @return [String]
    AudioContentPart = Struct.new(:input_audio, :type, keyword_init: true)
    # @!attribute [rw] format
    #   @return [String, nil]
    # @!attribute [rw] input
    #   @return [String]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] voice
    #   @return [String, nil]
    AudioSpeechRequest = Struct.new(:format, :input, :model, :provider, :voice, keyword_init: true)
    # @!attribute [rw] audio_b64
    #   @return [String, nil]
    # @!attribute [rw] audio_url
    #   @return [String, nil]
    # @!attribute [rw] chunking_strategy
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] known_speaker_names
    #   @return [Array<String>, nil]
    # @!attribute [rw] known_speaker_references
    #   @return [Array<String>, nil]
    # @!attribute [rw] language
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    AudioTranscriptionRequest = Struct.new(:audio_b64, :audio_url, :chunking_strategy, :known_speaker_names, :known_speaker_references, :language, :model, :provider, keyword_init: true)
    # @!attribute [rw] text
    #   @return [String, nil]
    AudioTranscriptionResponse = Struct.new(:text, keyword_init: true)
    # @!attribute [rw] audio_b64
    #   @return [String, nil]
    # @!attribute [rw] audio_url
    #   @return [String, nil]
    # @!attribute [rw] language
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] prompt
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] temperature
    #   @return [Float, nil]
    AudioTranslationRequest = Struct.new(:audio_b64, :audio_url, :language, :model, :prompt, :provider, :temperature, keyword_init: true)
    # @!attribute [rw] text
    #   @return [String, nil]
    AudioTranslationResponse = Struct.new(:text, keyword_init: true)
    # @!attribute [rw] billed
    #   @return [Boolean, nil]
    # @!attribute [rw] charged
    #   @return [Boolean, nil]
    # @!attribute [rw] cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] cost_usd
    #   @return [Float, nil]
    # @!attribute [rw] currency
    #   @return [String, nil]
    # @!attribute [rw] estimated_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] estimated_provider_cost
    #   @return [String, nil]
    # @!attribute [rw] estimated_user_cost
    #   @return [String, nil]
    # @!attribute [rw] estimation_sample_size
    #   @return [Integer, nil]
    # @!attribute [rw] estimation_total_rows
    #   @return [Integer, nil]
    # @!attribute [rw] estimation_truncated
    #   @return [Boolean, nil]
    # @!attribute [rw] finalized_at
    #   @return [String, nil]
    # @!attribute [rw] pricing_breakdown
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] reason
    #   @return [String, nil]
    # @!attribute [rw] reservation_id
    #   @return [String, nil]
    # @!attribute [rw] reservation_status
    #   @return [String, nil]
    # @!attribute [rw] reserved_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] settled_provider_cost
    #   @return [String, nil]
    # @!attribute [rw] settled_user_cost
    #   @return [String, nil]
    # @!attribute [rw] state
    #   @return [String, nil]
    # @!attribute [rw] total_nanos
    #   @return [Integer, nil]
    BatchBillingSummary = Struct.new(:billed, :charged, :cost_nanos, :cost_usd, :currency, :estimated_nanos, :estimated_provider_cost, :estimated_user_cost, :estimation_sample_size, :estimation_total_rows, :estimation_truncated, :finalized_at, :pricing_breakdown, :reason, :reservation_id, :reservation_status, :reserved_nanos, :settled_provider_cost, :settled_user_cost, :state, :total_nanos, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] first_id
    #   @return [String, nil]
    # @!attribute [rw] has_more
    #   @return [Boolean, nil]
    # @!attribute [rw] last_id
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    BatchListResponse = Struct.new(:data, :first_id, :has_more, :last_id, :object, keyword_init: true)
    # @!attribute [rw] input_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] output_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] pricing
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] providers
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] supported_parameters
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_parameters_detail
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] supported_params
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_params_detail
    #   @return [Hash{String => Object}, nil]
    BatchModelCapability = Struct.new(:input_types, :model, :name, :output_types, :pricing, :providers, :status, :supported_parameters, :supported_parameters_detail, :supported_params, :supported_params_detail, keyword_init: true)
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] supported_parameters
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_parameters_detail
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] supported_params
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_params_detail
    #   @return [Hash{String => Object}, nil]
    BatchModelProviderCapability = Struct.new(:id, :supported_parameters, :supported_parameters_detail, :supported_params, :supported_params_detail, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    BatchModelsResponse = Struct.new(:data, :object, keyword_init: true)
    # @!attribute [rw] documentation_url
    #   @return [String, nil]
    # @!attribute [rw] endpoints
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] gateway_input_modes
    #   @return [Array<String>, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] native_input_modes
    #   @return [Array<String>, nil]
    # @!attribute [rw] notes
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    BatchProviderCapability = Struct.new(:documentation_url, :endpoints, :gateway_input_modes, :id, :name, :native_input_modes, :notes, :status, keyword_init: true)
    # @!attribute [rw] completion_window
    #   @return [String, nil]
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] endpoint
    #   @return [String, nil]
    # @!attribute [rw] input_file_id
    #   @return [String, nil]
    # @!attribute [rw] items
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] max_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] prompts
    #   @return [Array<String>, nil]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] requests
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] system
    #   @return [String, nil]
    # @!attribute [rw] temperature
    #   @return [Float, nil]
    # @!attribute [rw] webhook
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] webhook_endpoint_id
    #   @return [String, nil]
    BatchRequest = Struct.new(:completion_window, :debug, :endpoint, :input_file_id, :items, :max_tokens, :metadata, :model, :prompts, :provider, :provider_options, :requests, :session_id, :system, :temperature, :webhook, :webhook_endpoint_id, keyword_init: true)
    # @!attribute [rw] completed
    #   @return [Integer, nil]
    # @!attribute [rw] failed
    #   @return [Integer, nil]
    # @!attribute [rw] total
    #   @return [Integer, nil]
    BatchRequestCounts = Struct.new(:completed, :failed, :total, keyword_init: true)
    # @!attribute [rw] body
    #   @return [Hash{String => Object}]
    # @!attribute [rw] custom_id
    #   @return [String, nil]
    # @!attribute [rw] method
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String, nil]
    BatchRequestItem = Struct.new(:body, :custom_id, :method, :url, keyword_init: true)
    # @!attribute [rw] completed_at
    #   @return [String, nil]
    # @!attribute [rw] cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] cost_usd
    #   @return [Float, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] custom_id
    #   @return [String, nil]
    # @!attribute [rw] endpoint
    #   @return [String, nil]
    # @!attribute [rw] error_body
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] meta
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] method
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] native_batch_id
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] request_body_hash
    #   @return [String, nil]
    # @!attribute [rw] request_index
    #   @return [Integer, nil]
    # @!attribute [rw] response_body
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] response_status
    #   @return [Integer, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    BatchRequestRow = Struct.new(:completed_at, :cost_nanos, :cost_usd, :created_at, :custom_id, :endpoint, :error_body, :id, :meta, :method, :model, :native_batch_id, :provider, :request_body_hash, :request_index, :response_body, :response_status, :status, :updated_at, :usage, keyword_init: true)
    # @!attribute [rw] billing
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] cancel_url
    #   @return [String, nil]
    # @!attribute [rw] cancelled_at
    #   @return [Integer, nil]
    # @!attribute [rw] cancelling_at
    #   @return [Integer, nil]
    # @!attribute [rw] completed_at
    #   @return [Integer, nil]
    # @!attribute [rw] completion_window
    #   @return [String, nil]
    # @!attribute [rw] created_at
    #   @return [Integer, nil]
    # @!attribute [rw] endpoint
    #   @return [String, nil]
    # @!attribute [rw] error_file_id
    #   @return [String, nil]
    # @!attribute [rw] errors
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] expired_at
    #   @return [Integer, nil]
    # @!attribute [rw] expires_at
    #   @return [Integer, nil]
    # @!attribute [rw] failed_at
    #   @return [Integer, nil]
    # @!attribute [rw] finalized_at
    #   @return [String, nil]
    # @!attribute [rw] finalizing_at
    #   @return [Integer, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] in_progress_at
    #   @return [Integer, nil]
    # @!attribute [rw] input_file_id
    #   @return [String, nil]
    # @!attribute [rw] last_webhook_dispatched_at
    #   @return [String, nil]
    # @!attribute [rw] last_webhook_progress
    #   @return [Float, nil]
    # @!attribute [rw] last_webhook_progress_at
    #   @return [String, nil]
    # @!attribute [rw] lifecycle_status
    #   @return [String, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] native_batch_id
    #   @return [String, nil]
    # @!attribute [rw] next_webhook_retry_at
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] output_file_id
    #   @return [String, nil]
    # @!attribute [rw] polling_url
    #   @return [String, nil]
    # @!attribute [rw] pricing_lines
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] progress
    #   @return [Integer, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] request_counts
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] results_url
    #   @return [String, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] webhook
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] websocket_url
    #   @return [String, nil]
    BatchResponse = Struct.new(:billing, :cancel_url, :cancelled_at, :cancelling_at, :completed_at, :completion_window, :created_at, :endpoint, :error_file_id, :errors, :expired_at, :expires_at, :failed_at, :finalized_at, :finalizing_at, :id, :in_progress_at, :input_file_id, :last_webhook_dispatched_at, :last_webhook_progress, :last_webhook_progress_at, :lifecycle_status, :metadata, :native_batch_id, :next_webhook_retry_at, :object, :output_file_id, :polling_url, :pricing_lines, :progress, :provider, :request_counts, :request_id, :results_url, :session_id, :status, :usage, :webhook, :websocket_url, keyword_init: true)
    BenchmarkId = Object
    # @!attribute [rw] scope
    #   @return [String, nil]
    # @!attribute [rw] ttl
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    CacheControl = Struct.new(:scope, :ttl, :type, keyword_init: true)
    # @!attribute [rw] audio_url
    #   @return [Hash{String => Object}]
    # @!attribute [rw] format
    #   @return [String, nil]
    # @!attribute [rw] mime_type
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String]
    ChatAudioOutputPart = Struct.new(:audio_url, :format, :mime_type, :type, keyword_init: true)
    # @!attribute [rw] finish_reason
    #   @return [String, nil]
    # @!attribute [rw] index
    #   @return [Integer, nil]
    # @!attribute [rw] message
    #   @return [Hash{String => Object}, nil]
    ChatChoice = Struct.new(:finish_reason, :index, :message, keyword_init: true)
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] echo_upstream_request
    #   @return [Boolean, nil]
    # @!attribute [rw] frequency_penalty
    #   @return [Float, nil]
    # @!attribute [rw] image_config
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] logit_bias
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] logprobs
    #   @return [Boolean, nil]
    # @!attribute [rw] max_completion_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] max_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] max_tool_calls
    #   @return [Integer, nil]
    # @!attribute [rw] messages
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] meta
    #   @return [Boolean, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] modalities
    #   @return [Array<String>, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] parallel_tool_calls
    #   @return [Boolean, nil]
    # @!attribute [rw] presence_penalty
    #   @return [Float, nil]
    # @!attribute [rw] prompt_cache_key
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] reasoning
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] reasoning_effort
    #   @return [String, nil]
    # @!attribute [rw] response_format
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] safety_identifier
    #   @return [String, nil]
    # @!attribute [rw] seed
    #   @return [Integer, nil]
    # @!attribute [rw] service_tier
    #   @return [String, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] stop
    #   @return [String, Array<String>, nil]
    # @!attribute [rw] store
    #   @return [Boolean, nil]
    # @!attribute [rw] stream
    #   @return [Boolean, nil]
    # @!attribute [rw] stream_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] temperature
    #   @return [Float, nil]
    # @!attribute [rw] tool_choice
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] tools
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] top_logprobs
    #   @return [Integer, nil]
    # @!attribute [rw] top_p
    #   @return [Float, nil]
    # @!attribute [rw] usage
    #   @return [Boolean, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    # @!attribute [rw] user_id
    #   @return [String, nil]
    ChatCompletionsRequest = Struct.new(:debug, :echo_upstream_request, :frequency_penalty, :image_config, :logit_bias, :logprobs, :max_completion_tokens, :max_tokens, :max_tool_calls, :messages, :meta, :metadata, :modalities, :model, :parallel_tool_calls, :presence_penalty, :prompt_cache_key, :provider, :provider_options, :reasoning, :reasoning_effort, :response_format, :safety_identifier, :seed, :service_tier, :session_id, :stop, :store, :stream, :stream_options, :temperature, :tool_choice, :tools, :top_logprobs, :top_p, :usage, :user, :user_id, keyword_init: true)
    # @!attribute [rw] choices
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] created
    #   @return [Integer, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] nativeResponseId
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    ChatCompletionsResponse = Struct.new(:choices, :created, :id, :model, :nativeResponseId, :object, :provider, :usage, keyword_init: true)
    # @!attribute [rw] image_url
    #   @return [Hash{String => Object}]
    # @!attribute [rw] mime_type
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String]
    ChatImageOutputPart = Struct.new(:image_url, :mime_type, :type, keyword_init: true)
    # @!attribute [rw] audios
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] content
    #   @return [String, Array<Hash{String => Object}>, nil]
    # @!attribute [rw] images
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] role
    #   @return [String]
    # @!attribute [rw] tool_call_id
    #   @return [String, nil]
    # @!attribute [rw] tool_calls
    #   @return [Array<Hash{String => Object}>, nil]
    ChatMessage = Struct.new(:audios, :content, :images, :name, :role, :tool_call_id, :tool_calls, keyword_init: true)
    # @!attribute [rw] credits
    #   @return [Hash{String => Object}]
    # @!attribute [rw] ok
    #   @return [String]
    CreditsResponse = Struct.new(:credits, :ok, keyword_init: true)
    DataContributionCategories = Struct.new(:_unused, keyword_init: true)
    # @!attribute [rw] categories
    #   @return [Hash{String => Object}]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] instructions
    #   @return [String]
    # @!attribute [rw] kind
    #   @return [String]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] sample_rate_bps
    #   @return [Integer]
    # @!attribute [rw] service_tier
    #   @return [String]
    # @!attribute [rw] slug
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    DataContributionClassifier = Struct.new(:categories, :created_at, :description, :enabled, :id, :instructions, :kind, :model, :name, :sample_rate_bps, :service_tier, :slug, :updated_at, keyword_init: true)
    # @!attribute [rw] categories
    #   @return [Hash{String => Object}]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] instructions
    #   @return [String]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] sampleRateBps
    #   @return [Integer, nil]
    # @!attribute [rw] serviceTier
    #   @return [String, nil]
    # @!attribute [rw] slug
    #   @return [String, nil]
    DataContributionClassifierCreateRequest = Struct.new(:categories, :description, :enabled, :instructions, :model, :name, :sampleRateBps, :serviceTier, :slug, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DataContributionClassifierDeleteResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] categories
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] instructions
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] sampleRateBps
    #   @return [Integer, nil]
    # @!attribute [rw] serviceTier
    #   @return [String, nil]
    DataContributionClassifierInput = Struct.new(:categories, :description, :enabled, :instructions, :model, :name, :sampleRateBps, :serviceTier, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DataContributionClassifierResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] categories
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] instructions
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] sampleRateBps
    #   @return [Integer, nil]
    # @!attribute [rw] serviceTier
    #   @return [String, nil]
    DataContributionClassifierUpdateRequest = Struct.new(:categories, :description, :enabled, :instructions, :model, :name, :sampleRateBps, :serviceTier, keyword_init: true)
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] reason
    #   @return [String, nil]
    DataContributionConsentRequest = Struct.new(:enabled, :reason, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DataContributionConsentResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DataContributionOverviewResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] deprecation_date
    #   @return [String, nil]
    # @!attribute [rw] hidden
    #   @return [Boolean, nil]
    # @!attribute [rw] input_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] lifecycle
    #   @return [ModelLifecycle, nil]
    # @!attribute [rw] model_id
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] organisation
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] output_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] release_date
    #   @return [String, nil]
    # @!attribute [rw] retirement_date
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    DataModel = Struct.new(:deprecation_date, :hidden, :input_types, :lifecycle, :model_id, :name, :organisation, :output_types, :release_date, :retirement_date, :status, keyword_init: true)
    DataModelOrganisation = Object
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] return_upstream_request
    #   @return [Boolean, nil]
    # @!attribute [rw] return_upstream_response
    #   @return [Boolean, nil]
    # @!attribute [rw] trace
    #   @return [Boolean, nil]
    # @!attribute [rw] trace_level
    #   @return [String, nil]
    DebugOptions = Struct.new(:enabled, :return_upstream_request, :return_upstream_response, :trace, :trace_level, keyword_init: true)
    # @!attribute [rw] deleted
    #   @return [String]
    DeletedResponse = Struct.new(:deleted, keyword_init: true)
    # @!attribute [rw] config
    #   @return [Hash{String => Object}]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] deployed_version
    #   @return [Integer, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] key_ids
    #   @return [Array<String>]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] slug
    #   @return [String]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] version
    #   @return [Integer]
    # @!attribute [rw] versions
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] workspace_id
    #   @return [String]
    DynamicRoute = Struct.new(:config, :created_at, :deployed_version, :description, :id, :key_ids, :name, :slug, :status, :updated_at, :version, :versions, :workspace_id, keyword_init: true)
    # @!attribute [rw] allowFallbacks
    #   @return [Boolean, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] modelFallbacks
    #   @return [Array<String>, nil]
    # @!attribute [rw] providerIgnore
    #   @return [Array<String>, nil]
    # @!attribute [rw] providerOnly
    #   @return [Array<String>, nil]
    # @!attribute [rw] providerOrder
    #   @return [Array<String>, nil]
    # @!attribute [rw] routingMode
    #   @return [String, nil]
    DynamicRouteAction = Struct.new(:allowFallbacks, :model, :modelFallbacks, :providerIgnore, :providerOnly, :providerOrder, :routingMode, keyword_init: true)
    # @!attribute [rw] field
    #   @return [String]
    # @!attribute [rw] metadataKey
    #   @return [String, nil]
    # @!attribute [rw] operator
    #   @return [String]
    # @!attribute [rw] value
    #   @return [String, nil]
    DynamicRouteCondition = Struct.new(:field, :metadataKey, :operator, :value, keyword_init: true)
    # @!attribute [rw] cacheAwareRouting
    #   @return [Boolean, nil]
    # @!attribute [rw] defaultAction
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] edges
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] entryNodeId
    #   @return [String, nil]
    # @!attribute [rw] nodes
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] rules
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] schemaVersion
    #   @return [String, nil]
    # @!attribute [rw] sessionAffinity
    #   @return [Boolean, nil]
    DynamicRouteConfig = Struct.new(:cacheAwareRouting, :defaultAction, :edges, :entryNodeId, :nodes, :rules, :schemaVersion, :sessionAffinity, keyword_init: true)
    # @!attribute [rw] config
    #   @return [Hash{String => Object}]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] slug
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    DynamicRouteCreateRequest = Struct.new(:config, :description, :name, :slug, :status, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DynamicRouteDeleteResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DynamicRouteDeployResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] source
    #   @return [String]
    # @!attribute [rw] sourceHandle
    #   @return [String, nil]
    # @!attribute [rw] target
    #   @return [String]
    DynamicRouteEdge = Struct.new(:id, :source, :sourceHandle, :target, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DynamicRouteKeysResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] key_ids
    #   @return [Array<String>]
    DynamicRouteKeysUpdateRequest = Struct.new(:key_ids, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    DynamicRouteListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] position
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] type
    #   @return [String]
    DynamicRouteNode = Struct.new(:data, :id, :position, :type, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    DynamicRouteResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] action
    #   @return [Hash{String => Object}]
    # @!attribute [rw] condition
    #   @return [Hash{String => Object}]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    DynamicRouteRule = Struct.new(:action, :condition, :enabled, :id, :name, keyword_init: true)
    # @!attribute [rw] config
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    DynamicRouteUpdateRequest = Struct.new(:config, :description, :name, :status, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] version
    #   @return [Integer]
    DynamicRouteVersion = Struct.new(:created_at, :created_by, :status, :version, keyword_init: true)
    # @!attribute [rw] embedding
    #   @return [Array<Float>, nil]
    # @!attribute [rw] index
    #   @return [Integer, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    Embedding = Struct.new(:embedding, :index, :object, keyword_init: true)
    # @!attribute [rw] content
    #   @return [Array<Hash{String => Object}>]
    EmbeddingsMultimodalInput = Struct.new(:content, keyword_init: true)
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] dimensions
    #   @return [Integer, nil]
    # @!attribute [rw] encoding_format
    #   @return [String, nil]
    # @!attribute [rw] input
    #   @return [String, Array<Integer>, Hash{String => Object}, Array<String, Array<Integer>, Hash{String => Object}>]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    EmbeddingsRequest = Struct.new(:debug, :dimensions, :encoding_format, :input, :model, :provider, :provider_options, :user, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    EmbeddingsResponse = Struct.new(:data, :model, :object, :usage, keyword_init: true)
    # @!attribute [rw] capability_id
    #   @return [String]
    # @!attribute [rw] collection
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] model_count
    #   @return [Integer]
    # @!attribute [rw] provider_count
    #   @return [Integer]
    # @!attribute [rw] public_path
    #   @return [String]
    EndpointCatalogueEntry = Struct.new(:capability_id, :collection, :id, :model_count, :provider_count, :public_path, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] endpoints
    #   @return [Array<String>]
    # @!attribute [rw] ok
    #   @return [String]
    # @!attribute [rw] sample_models
    #   @return [Array<String>]
    EndpointCatalogueResponse = Struct.new(:data, :endpoints, :ok, :sample_models, keyword_init: true)
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] retryable
    #   @return [Boolean, nil]
    # @!attribute [rw] status
    #   @return [Integer, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    # @!attribute [rw] upstream_error_code
    #   @return [String, nil]
    # @!attribute [rw] upstream_error_description
    #   @return [String, nil]
    # @!attribute [rw] upstream_error_message
    #   @return [String, nil]
    # @!attribute [rw] upstream_error_param
    #   @return [String, nil]
    # @!attribute [rw] upstream_payload_preview
    #   @return [String, nil]
    ErrorFailureSampleItem = Struct.new(:provider, :retryable, :status, :type, :upstream_error_code, :upstream_error_description, :upstream_error_message, :upstream_error_param, :upstream_payload_preview, keyword_init: true)
    # @!attribute [rw] candidateCount
    #   @return [Integer, nil]
    # @!attribute [rw] droppedMissingAdapter
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] droppedUnsupportedEndpoint
    #   @return [Array<String>, nil]
    # @!attribute [rw] supportsEndpointCount
    #   @return [Integer, nil]
    # @!attribute [rw] totalProviders
    #   @return [Integer, nil]
    ErrorProviderCandidateDiagnostics = Struct.new(:candidateCount, :droppedMissingAdapter, :droppedUnsupportedEndpoint, :supportsEndpointCount, :totalProviders, keyword_init: true)
    # @!attribute [rw] capability
    #   @return [String, nil]
    # @!attribute [rw] dropped
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] providersAfter
    #   @return [Array<String>, nil]
    # @!attribute [rw] providersBefore
    #   @return [Array<String>, nil]
    ErrorProviderEnablementDiagnostics = Struct.new(:capability, :dropped, :providersAfter, :providersBefore, keyword_init: true)
    # @!attribute [rw] category
    #   @return [String, nil]
    # @!attribute [rw] hint
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    ErrorProviderFailureDiagnostics = Struct.new(:category, :hint, :provider, keyword_init: true)
    # @!attribute [rw] attempt_count
    #   @return [Integer, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] details
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] error
    #   @return [String, Hash{String => Object}]
    # @!attribute [rw] error_origin
    #   @return [String, nil]
    # @!attribute [rw] error_type
    #   @return [String, nil]
    # @!attribute [rw] failed_providers
    #   @return [Array<String>, nil]
    # @!attribute [rw] failed_statuses
    #   @return [Array<Integer>, nil]
    # @!attribute [rw] failure_sample
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] generation_id
    #   @return [String, nil]
    # @!attribute [rw] message
    #   @return [String, nil]
    # @!attribute [rw] missing_pricing_providers
    #   @return [Array<String>, nil]
    # @!attribute [rw] ok
    #   @return [Boolean, nil]
    # @!attribute [rw] provider_candidate_diagnostics
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_enablement
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_failure_diagnostics
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_payment_required_provider
    #   @return [String, nil]
    # @!attribute [rw] provider_payment_required_support_notice
    #   @return [String, nil]
    # @!attribute [rw] reason
    #   @return [String, nil]
    # @!attribute [rw] routing_diagnostics
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] status_code
    #   @return [Integer, nil]
    # @!attribute [rw] upstream_error
    #   @return [Hash{String => Object}, nil]
    ErrorResponse = Struct.new(:attempt_count, :description, :details, :error, :error_origin, :error_type, :failed_providers, :failed_statuses, :failure_sample, :generation_id, :message, :missing_pricing_providers, :ok, :provider_candidate_diagnostics, :provider_enablement, :provider_failure_diagnostics, :provider_payment_required_provider, :provider_payment_required_support_notice, :reason, :routing_diagnostics, :status_code, :upstream_error, keyword_init: true)
    # @!attribute [rw] filterStages
    #   @return [Array<Hash{String => Object}>, nil]
    ErrorRoutingDiagnostics = Struct.new(:filterStages, keyword_init: true)
    # @!attribute [rw] code
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] message
    #   @return [String, nil]
    # @!attribute [rw] param
    #   @return [String, nil]
    ErrorUpstreamError = Struct.new(:code, :description, :message, :param, keyword_init: true)
    # @!attribute [rw] bytes
    #   @return [Integer, nil]
    # @!attribute [rw] created_at
    #   @return [Integer, nil]
    # @!attribute [rw] filename
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] purpose
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] status_details
    #   @return [Hash{String => Object}, nil]
    FileResponse = Struct.new(:bytes, :created_at, :filename, :id, :object, :purpose, :status, :status_details, keyword_init: true)
    # @!attribute [rw] file
    #   @return [Object]
    # @!attribute [rw] purpose
    #   @return [String]
    FileUploadRequest = Struct.new(:file, :purpose, keyword_init: true)
    # @!attribute [rw] async
    #   @return [Boolean, nil]
    # @!attribute [rw] function
    #   @return [Hash{String => Object}]
    # @!attribute [rw] type
    #   @return [String]
    FunctionToolDefinition = Struct.new(:async, :function, :type, keyword_init: true)
    # @!attribute [rw] parameters
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] type
    #   @return [String]
    FusionToolDefinition = Struct.new(:parameters, :type, keyword_init: true)
    # @!attribute [rw] endpoints
    #   @return [Array<String>, nil]
    # @!attribute [rw] parameter_details
    #   @return [Hash{String => Object}]
    # @!attribute [rw] parameters
    #   @return [Array<String>]
    GatewayCapabilities = Struct.new(:endpoints, :parameter_details, :parameters, keyword_init: true)
    GatewayCapabilityStatus = Object
    # @!attribute [rw] parameters
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] timezone
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String]
    GatewayDatetimeToolDefinition = Struct.new(:parameters, :timezone, :type, keyword_init: true)
    # @!attribute [rw] comment
    #   @return [String, nil]
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] created_by_user_id
    #   @return [String, nil]
    # @!attribute [rw] end_user_id
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}]
    # @!attribute [rw] metadata_dimensions
    #   @return [Hash{String => Object}]
    # @!attribute [rw] preset_id
    #   @return [String, nil]
    # @!attribute [rw] rating
    #   @return [String, nil]
    # @!attribute [rw] reason
    #   @return [String, nil]
    # @!attribute [rw] reason_tags
    #   @return [Array<String>]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] score
    #   @return [Float, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] source
    #   @return [String]
    # @!attribute [rw] test_run_id
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    GatewayFeedback = Struct.new(:comment, :created_at, :created_by_user_id, :end_user_id, :id, :metadata, :metadata_dimensions, :preset_id, :rating, :reason, :reason_tags, :request_id, :score, :session_id, :source, :test_run_id, :workspace_id, keyword_init: true)
    # @!attribute [rw] comment
    #   @return [String, nil]
    # @!attribute [rw] end_user_id
    #   @return [String, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] metadata_dimensions
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] preset_id
    #   @return [String, nil]
    # @!attribute [rw] rating
    #   @return [String, nil]
    # @!attribute [rw] reason
    #   @return [String, nil]
    # @!attribute [rw] reason_tags
    #   @return [Array<String>, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] score
    #   @return [Float, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] source
    #   @return [String, nil]
    # @!attribute [rw] test_run_id
    #   @return [String, nil]
    GatewayFeedbackCreateRequest = Struct.new(:comment, :end_user_id, :metadata, :metadata_dimensions, :preset_id, :rating, :reason, :reason_tags, :request_id, :score, :session_id, :source, :test_run_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    GatewayFeedbackListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    GatewayFeedbackResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] group_by
    #   @return [String]
    GatewayFeedbackSummaryResponse = Struct.new(:data, :group_by, keyword_init: true)
    # @!attribute [rw] average_score
    #   @return [Float, nil]
    # @!attribute [rw] count
    #   @return [Integer]
    # @!attribute [rw] last_feedback_at
    #   @return [String, nil]
    # @!attribute [rw] metadata_key
    #   @return [String, nil]
    # @!attribute [rw] metadata_value
    #   @return [String, nil]
    # @!attribute [rw] negative
    #   @return [Integer]
    # @!attribute [rw] partial
    #   @return [Integer]
    # @!attribute [rw] positive
    #   @return [Integer]
    # @!attribute [rw] preset_id
    #   @return [String, nil]
    # @!attribute [rw] ratings
    #   @return [Hash{String => Object}]
    # @!attribute [rw] test_run_id
    #   @return [String, nil]
    GatewayFeedbackSummaryRow = Struct.new(:average_score, :count, :last_feedback_at, :metadata_key, :metadata_value, :negative, :partial, :positive, :preset_id, :ratings, :test_run_id, keyword_init: true)
    # @!attribute [rw] input
    #   @return [Array<String>]
    # @!attribute [rw] output
    #   @return [Array<String>]
    GatewayModalities = Struct.new(:input, :output, keyword_init: true)
    # @!attribute [rw] deprecated_at
    #   @return [String, nil]
    # @!attribute [rw] message
    #   @return [String, nil]
    # @!attribute [rw] released_at
    #   @return [String, nil]
    # @!attribute [rw] replacement_id
    #   @return [String, nil]
    # @!attribute [rw] retires_at
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    GatewayModelLifecycle = Struct.new(:deprecated_at, :message, :released_at, :replacement_id, :retires_at, :status, keyword_init: true)
    # @!attribute [rw] input_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] output_tokens
    #   @return [Integer, nil]
    GatewayModelLimits = Struct.new(:input_tokens, :output_tokens, keyword_init: true)
    # @!attribute [rw] capabilities
    #   @return [Hash{String => Object}]
    # @!attribute [rw] effective
    #   @return [Hash{String => Object}]
    # @!attribute [rw] endpoints
    #   @return [Array<String>]
    # @!attribute [rw] modalities
    #   @return [Hash{String => Object}]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] pricing
    #   @return [Hash{String => Object}]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}]
    # @!attribute [rw] routable
    #   @return [Boolean]
    # @!attribute [rw] routing
    #   @return [Hash{String => Object}]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] status_reason
    #   @return [String]
    GatewayModelOffer = Struct.new(:capabilities, :effective, :endpoints, :modalities, :model, :pricing, :provider, :routable, :routing, :status, :status_reason, keyword_init: true)
    GatewayModelOrganization = Object
    # @!attribute [rw] availability_mode
    #   @return [String]
    # @!attribute [rw] limit
    #   @return [Integer]
    # @!attribute [rw] models
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] offset
    #   @return [Integer]
    # @!attribute [rw] ok
    #   @return [Boolean]
    # @!attribute [rw] total
    #   @return [Integer]
    GatewayModelsResponse = Struct.new(:availability_mode, :limit, :models, :offset, :ok, :total, keyword_init: true)
    # @!attribute [rw] category
    #   @return [String]
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] created_by_user_id
    #   @return [String, nil]
    # @!attribute [rw] end_user_id
    #   @return [String, nil]
    # @!attribute [rw] event_name
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}]
    # @!attribute [rw] metadata_dimensions
    #   @return [Hash{String => Object}]
    # @!attribute [rw] numeric_value
    #   @return [Float, nil]
    # @!attribute [rw] occurred_at
    #   @return [String]
    # @!attribute [rw] preset_id
    #   @return [String, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] source
    #   @return [String]
    # @!attribute [rw] test_run_id
    #   @return [String, nil]
    # @!attribute [rw] value
    #   @return [Object, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    GatewayObservabilityEvent = Struct.new(:category, :created_at, :created_by_user_id, :end_user_id, :event_name, :id, :metadata, :metadata_dimensions, :numeric_value, :occurred_at, :preset_id, :request_id, :session_id, :source, :test_run_id, :value, :workspace_id, keyword_init: true)
    # @!attribute [rw] category
    #   @return [String, nil]
    # @!attribute [rw] end_user_id
    #   @return [String, nil]
    # @!attribute [rw] event_name
    #   @return [String]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] metadata_dimensions
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] numeric_value
    #   @return [Float, nil]
    # @!attribute [rw] occurred_at
    #   @return [String, nil]
    # @!attribute [rw] preset_id
    #   @return [String, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] source
    #   @return [String, nil]
    # @!attribute [rw] test_run_id
    #   @return [String, nil]
    # @!attribute [rw] value
    #   @return [Object, nil]
    GatewayObservabilityEventCreateRequest = Struct.new(:category, :end_user_id, :event_name, :metadata, :metadata_dimensions, :numeric_value, :occurred_at, :preset_id, :request_id, :session_id, :source, :test_run_id, :value, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    GatewayObservabilityEventListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    GatewayObservabilityEventResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] meters
    #   @return [Hash{String => Object}]
    # @!attribute [rw] pricing_plan
    #   @return [String]
    GatewayPricing = Struct.new(:meters, :pricing_plan, keyword_init: true)
    GatewayPricingMeter = Object
    GatewayProviderAvailabilityReason = Object
    # @!attribute [rw] auth_method
    #   @return [String, nil]
    # @!attribute [rw] byok
    #   @return [Boolean, nil]
    # @!attribute [rw] canonical_model_id
    #   @return [String, nil]
    # @!attribute [rw] cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] currency
    #   @return [String, nil]
    # @!attribute [rw] endpoint
    #   @return [String, nil]
    # @!attribute [rw] error_code
    #   @return [String, nil]
    # @!attribute [rw] finish_reason
    #   @return [String, nil]
    # @!attribute [rw] generation_ms
    #   @return [Float, nil]
    # @!attribute [rw] key_id
    #   @return [String, nil]
    # @!attribute [rw] latency_ms
    #   @return [Float, nil]
    # @!attribute [rw] location
    #   @return [String, nil]
    # @!attribute [rw] model_id
    #   @return [String, nil]
    # @!attribute [rw] native_response_id
    #   @return [String, nil]
    # @!attribute [rw] oauth_client_id
    #   @return [String, nil]
    # @!attribute [rw] pricing_lines
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] requested_model_id
    #   @return [String, nil]
    # @!attribute [rw] routed_model_id
    #   @return [String, nil]
    # @!attribute [rw] status_code
    #   @return [Integer, nil]
    # @!attribute [rw] stream
    #   @return [Boolean, nil]
    # @!attribute [rw] success
    #   @return [Boolean, nil]
    # @!attribute [rw] throughput
    #   @return [Float, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    GatewayRequestLog = Struct.new(:auth_method, :byok, :canonical_model_id, :cost_nanos, :created_at, :currency, :endpoint, :error_code, :finish_reason, :generation_ms, :key_id, :latency_ms, :location, :model_id, :native_response_id, :oauth_client_id, :pricing_lines, :provider, :request_id, :requested_model_id, :routed_model_id, :status_code, :stream, :success, :throughput, :usage, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] from_time
    #   @return [String]
    # @!attribute [rw] limit
    #   @return [Integer]
    # @!attribute [rw] offset
    #   @return [Integer]
    # @!attribute [rw] ok
    #   @return [String]
    # @!attribute [rw] to_time
    #   @return [String, nil]
    # @!attribute [rw] total
    #   @return [Integer]
    GatewayRequestLogListResponse = Struct.new(:data, :from_time, :limit, :offset, :ok, :to_time, :total, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    # @!attribute [rw] ok
    #   @return [String]
    GatewayRequestLogResponse = Struct.new(:data, :ok, keyword_init: true)
    GatewayRoutingStatus = Object
    # @!attribute [rw] max_chars
    #   @return [Integer, nil]
    # @!attribute [rw] parameters
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] type
    #   @return [String]
    GatewayWebFetchToolDefinition = Struct.new(:max_chars, :parameters, :type, keyword_init: true)
    # @!attribute [rw] engine
    #   @return [String, nil]
    # @!attribute [rw] include_highlights
    #   @return [Boolean, nil]
    # @!attribute [rw] include_text
    #   @return [Boolean, nil]
    # @!attribute [rw] language
    #   @return [String, nil]
    # @!attribute [rw] max_results
    #   @return [Integer, nil]
    # @!attribute [rw] page
    #   @return [Integer, nil]
    # @!attribute [rw] parameters
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] type
    #   @return [String]
    GatewayWebSearchToolDefinition = Struct.new(:engine, :include_highlights, :include_text, :language, :max_results, :page, :parameters, :type, keyword_init: true)
    # @!attribute [rw] app_id
    #   @return [String, nil]
    # @!attribute [rw] byok
    #   @return [Boolean, nil]
    # @!attribute [rw] cost_nanos
    #   @return [Float, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] currency
    #   @return [String, nil]
    # @!attribute [rw] endpoint
    #   @return [String, nil]
    # @!attribute [rw] error_code
    #   @return [String, nil]
    # @!attribute [rw] error_message
    #   @return [String, nil]
    # @!attribute [rw] generation_ms
    #   @return [Float, nil]
    # @!attribute [rw] key_id
    #   @return [String, nil]
    # @!attribute [rw] latency_ms
    #   @return [Float, nil]
    # @!attribute [rw] model_id
    #   @return [String, nil]
    # @!attribute [rw] native_response_id
    #   @return [String, nil]
    # @!attribute [rw] pricing_lines
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] replay_request
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] replay_supported
    #   @return [Boolean, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] status_code
    #   @return [Float, nil]
    # @!attribute [rw] stream
    #   @return [Boolean, nil]
    # @!attribute [rw] success
    #   @return [Boolean, nil]
    # @!attribute [rw] team_id
    #   @return [String, nil]
    # @!attribute [rw] throughput
    #   @return [Float, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    GenerationResponse = Struct.new(:app_id, :byok, :cost_nanos, :created_at, :currency, :endpoint, :error_code, :error_message, :generation_ms, :key_id, :latency_ms, :model_id, :native_response_id, :pricing_lines, :provider, :replay_request, :replay_supported, :request_id, :status_code, :stream, :success, :team_id, :throughput, :usage, keyword_init: true)
    # @!attribute [rw] allowed_api_model_ids
    #   @return [Array<String>, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] daily_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] daily_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] model_restriction_mode
    #   @return [String, nil]
    # @!attribute [rw] monthly_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] monthly_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] privacy_enable_free_may_publish_prompts
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_free_may_train
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_input_output_logging
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_paid_may_train
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_zdr_only
    #   @return [Boolean, nil]
    # @!attribute [rw] prompt_injection_action
    #   @return [String, nil]
    # @!attribute [rw] prompt_injection_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] provider_restriction_enforce_allowed
    #   @return [Boolean, nil]
    # @!attribute [rw] provider_restriction_mode
    #   @return [String, nil]
    # @!attribute [rw] provider_restriction_provider_ids
    #   @return [Array<String>, nil]
    # @!attribute [rw] sensitive_info_default_action
    #   @return [String, nil]
    # @!attribute [rw] sensitive_info_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] sensitive_info_rules
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] weekly_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] weekly_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    Guardrail = Struct.new(:allowed_api_model_ids, :created_at, :daily_limit_cost_nanos, :daily_limit_requests, :description, :enabled, :id, :model_restriction_mode, :monthly_limit_cost_nanos, :monthly_limit_requests, :name, :privacy_enable_free_may_publish_prompts, :privacy_enable_free_may_train, :privacy_enable_input_output_logging, :privacy_enable_paid_may_train, :privacy_zdr_only, :prompt_injection_action, :prompt_injection_enabled, :provider_restriction_enforce_allowed, :provider_restriction_mode, :provider_restriction_provider_ids, :sensitive_info_default_action, :sensitive_info_enabled, :sensitive_info_rules, :updated_at, :weekly_limit_cost_nanos, :weekly_limit_requests, :workspace_id, keyword_init: true)
    # @!attribute [rw] dailyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] dailyRequests
    #   @return [Integer, nil]
    # @!attribute [rw] monthlyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] monthlyRequests
    #   @return [Integer, nil]
    # @!attribute [rw] weeklyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] weeklyRequests
    #   @return [Integer, nil]
    GuardrailBudgetInput = Struct.new(:dailyCostNanos, :dailyRequests, :monthlyCostNanos, :monthlyRequests, :weeklyCostNanos, :weeklyRequests, keyword_init: true)
    # @!attribute [rw] allowedApiModelIds
    #   @return [Array<String>, nil]
    # @!attribute [rw] budgets
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] modelRestrictionMode
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] privacyEnableFreeMayPublishPrompts
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnableFreeMayTrain
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnableInputOutputLogging
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnablePaidMayTrain
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyZdrOnly
    #   @return [Boolean, nil]
    # @!attribute [rw] promptInjectionAction
    #   @return [String, nil]
    # @!attribute [rw] promptInjectionEnabled
    #   @return [Boolean, nil]
    # @!attribute [rw] providerRestrictionEnforceAllowed
    #   @return [Boolean, nil]
    # @!attribute [rw] providerRestrictionMode
    #   @return [String, nil]
    # @!attribute [rw] providerRestrictionProviderIds
    #   @return [Array<String>, nil]
    # @!attribute [rw] sensitiveInfoDefaultAction
    #   @return [String, nil]
    # @!attribute [rw] sensitiveInfoEnabled
    #   @return [Boolean, nil]
    # @!attribute [rw] sensitiveInfoRules
    #   @return [Array<Hash{String => Object}>, nil]
    GuardrailCreateRequest = Struct.new(:allowedApiModelIds, :budgets, :description, :enabled, :modelRestrictionMode, :name, :privacyEnableFreeMayPublishPrompts, :privacyEnableFreeMayTrain, :privacyEnableInputOutputLogging, :privacyEnablePaidMayTrain, :privacyZdrOnly, :promptInjectionAction, :promptInjectionEnabled, :providerRestrictionEnforceAllowed, :providerRestrictionMode, :providerRestrictionProviderIds, :sensitiveInfoDefaultAction, :sensitiveInfoEnabled, :sensitiveInfoRules, keyword_init: true)
    # @!attribute [rw] deleted
    #   @return [String]
    GuardrailDeleteResponse = Struct.new(:deleted, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    GuardrailDetailResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] added_count
    #   @return [Integer]
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    GuardrailKeyAddResponse = Struct.new(:added_count, :data, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] key_id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    GuardrailKeyAssignment = Struct.new(:created_at, :key_id, :name, :prefix, :status, keyword_init: true)
    # @!attribute [rw] key_ids
    #   @return [Array<String>]
    GuardrailKeyIdsReplaceRequest = Struct.new(:key_ids, keyword_init: true)
    # @!attribute [rw] key_ids
    #   @return [Array<String>]
    GuardrailKeyIdsRequest = Struct.new(:key_ids, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    GuardrailKeyListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    GuardrailKeySetResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    GuardrailListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] added_count
    #   @return [Integer]
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    GuardrailMemberAddResponse = Struct.new(:added_count, :data, keyword_init: true)
    # @!attribute [rw] display_name
    #   @return [String, nil]
    # @!attribute [rw] joined_at
    #   @return [String, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] user_id
    #   @return [String]
    GuardrailMemberAssignment = Struct.new(:display_name, :joined_at, :role, :user_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    GuardrailMemberListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] allowedApiModelIds
    #   @return [Array<String>, nil]
    # @!attribute [rw] budgets
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] modelRestrictionMode
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] privacyEnableFreeMayPublishPrompts
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnableFreeMayTrain
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnableInputOutputLogging
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnablePaidMayTrain
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyZdrOnly
    #   @return [Boolean, nil]
    # @!attribute [rw] promptInjectionAction
    #   @return [String, nil]
    # @!attribute [rw] promptInjectionEnabled
    #   @return [Boolean, nil]
    # @!attribute [rw] providerRestrictionEnforceAllowed
    #   @return [Boolean, nil]
    # @!attribute [rw] providerRestrictionMode
    #   @return [String, nil]
    # @!attribute [rw] providerRestrictionProviderIds
    #   @return [Array<String>, nil]
    # @!attribute [rw] sensitiveInfoDefaultAction
    #   @return [String, nil]
    # @!attribute [rw] sensitiveInfoEnabled
    #   @return [Boolean, nil]
    # @!attribute [rw] sensitiveInfoRules
    #   @return [Array<Hash{String => Object}>, nil]
    GuardrailPolicyInput = Struct.new(:allowedApiModelIds, :budgets, :description, :enabled, :modelRestrictionMode, :name, :privacyEnableFreeMayPublishPrompts, :privacyEnableFreeMayTrain, :privacyEnableInputOutputLogging, :privacyEnablePaidMayTrain, :privacyZdrOnly, :promptInjectionAction, :promptInjectionEnabled, :providerRestrictionEnforceAllowed, :providerRestrictionMode, :providerRestrictionProviderIds, :sensitiveInfoDefaultAction, :sensitiveInfoEnabled, :sensitiveInfoRules, keyword_init: true)
    # @!attribute [rw] removed_count
    #   @return [Integer]
    GuardrailRemoveResponse = Struct.new(:removed_count, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    GuardrailResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] allowedApiModelIds
    #   @return [Array<String>, nil]
    # @!attribute [rw] budgets
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] modelRestrictionMode
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] privacyEnableFreeMayPublishPrompts
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnableFreeMayTrain
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnableInputOutputLogging
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyEnablePaidMayTrain
    #   @return [Boolean, nil]
    # @!attribute [rw] privacyZdrOnly
    #   @return [Boolean, nil]
    # @!attribute [rw] promptInjectionAction
    #   @return [String, nil]
    # @!attribute [rw] promptInjectionEnabled
    #   @return [Boolean, nil]
    # @!attribute [rw] providerRestrictionEnforceAllowed
    #   @return [Boolean, nil]
    # @!attribute [rw] providerRestrictionMode
    #   @return [String, nil]
    # @!attribute [rw] providerRestrictionProviderIds
    #   @return [Array<String>, nil]
    # @!attribute [rw] sensitiveInfoDefaultAction
    #   @return [String, nil]
    # @!attribute [rw] sensitiveInfoEnabled
    #   @return [Boolean, nil]
    # @!attribute [rw] sensitiveInfoRules
    #   @return [Array<Hash{String => Object}>, nil]
    GuardrailUpdateRequest = Struct.new(:allowedApiModelIds, :budgets, :description, :enabled, :modelRestrictionMode, :name, :privacyEnableFreeMayPublishPrompts, :privacyEnableFreeMayTrain, :privacyEnableInputOutputLogging, :privacyEnablePaidMayTrain, :privacyZdrOnly, :promptInjectionAction, :promptInjectionEnabled, :providerRestrictionEnforceAllowed, :providerRestrictionMode, :providerRestrictionProviderIds, :sensitiveInfoDefaultAction, :sensitiveInfoEnabled, :sensitiveInfoRules, keyword_init: true)
    # @!attribute [rw] user_ids
    #   @return [Array<String>]
    GuardrailUserIdsRequest = Struct.new(:user_ids, keyword_init: true)
    # @!attribute [rw] b64_json
    #   @return [String, nil]
    # @!attribute [rw] revised_prompt
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String, nil]
    Image = Struct.new(:b64_json, :revised_prompt, :url, keyword_init: true)
    # @!attribute [rw] aspect_ratio
    #   @return [String, nil]
    # @!attribute [rw] font_inputs
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] image_size
    #   @return [String, nil]
    # @!attribute [rw] include_rai_reason
    #   @return [Boolean, nil]
    # @!attribute [rw] reference_images
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] super_resolution_references
    #   @return [Array<String>, nil]
    ImageConfig = Struct.new(:aspect_ratio, :font_inputs, :image_size, :include_rai_reason, :reference_images, :super_resolution_references, keyword_init: true)
    # @!attribute [rw] image_url
    #   @return [Hash{String => Object}]
    # @!attribute [rw] type
    #   @return [String]
    ImageContentPart = Struct.new(:image_url, :type, keyword_init: true)
    # @!attribute [rw] image_url
    #   @return [Hash{String => Object}]
    # @!attribute [rw] type
    #   @return [String]
    ImageModerationInput = Struct.new(:image_url, :type, keyword_init: true)
    # @!attribute [rw] image
    #   @return [String]
    # @!attribute [rw] mask
    #   @return [String, nil]
    # @!attribute [rw] meta
    #   @return [Boolean, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] n
    #   @return [Integer, nil]
    # @!attribute [rw] prompt
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] resolution
    #   @return [String, nil]
    # @!attribute [rw] size
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Boolean, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    ImagesEditRequest = Struct.new(:image, :mask, :meta, :model, :n, :prompt, :provider, :resolution, :size, :usage, :user, keyword_init: true)
    # @!attribute [rw] created
    #   @return [Integer, nil]
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    ImagesEditResponse = Struct.new(:created, :data, keyword_init: true)
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] n
    #   @return [Integer, nil]
    # @!attribute [rw] prompt
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] quality
    #   @return [String, nil]
    # @!attribute [rw] resolution
    #   @return [String, nil]
    # @!attribute [rw] response_format
    #   @return [String, nil]
    # @!attribute [rw] size
    #   @return [String, nil]
    # @!attribute [rw] style
    #   @return [String, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    ImagesGenerationRequest = Struct.new(:model, :n, :prompt, :provider, :quality, :resolution, :response_format, :size, :style, :user, keyword_init: true)
    # @!attribute [rw] created
    #   @return [Integer, nil]
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    ImagesGenerationResponse = Struct.new(:created, :data, keyword_init: true)
    # @!attribute [rw] error
    #   @return [String]
    # @!attribute [rw] max_offset
    #   @return [Integer, nil]
    # @!attribute [rw] message
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    InvalidRequestResponse = Struct.new(:error, :max_offset, :message, :ok, keyword_init: true)
    # @!attribute [rw] key
    #   @return [Hash{String => Object}]
    # @!attribute [rw] message
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    KeyInvalidateResponse = Struct.new(:key, :message, :ok, keyword_init: true)
    KnownModelId = Object
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    ListFilesResponse = Struct.new(:data, :object, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    ManagementKeyCollectionResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] scopes
    #   @return [String, Array<String>, nil]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] team_id
    #   @return [String, nil]
    ManagementKeyCreateRequest = Struct.new(:created_by, :name, :scopes, :soft_blocked, :status, :team_id, keyword_init: true)
    # @!attribute [rw] key
    #   @return [Hash{String => Object}]
    # @!attribute [rw] ok
    #   @return [String]
    ManagementKeyCreateResponse = Struct.new(:key, :ok, keyword_init: true)
    # @!attribute [rw] message
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    ManagementKeyDeleteResponse = Struct.new(:message, :ok, keyword_init: true)
    # @!attribute [rw] key
    #   @return [Hash{String => Object}]
    # @!attribute [rw] ok
    #   @return [String]
    ManagementKeyDetailResponse = Struct.new(:key, :ok, keyword_init: true)
    # @!attribute [rw] keys
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] limit
    #   @return [Integer]
    # @!attribute [rw] offset
    #   @return [Integer]
    # @!attribute [rw] ok
    #   @return [String]
    # @!attribute [rw] total
    #   @return [Integer]
    ManagementKeyListResponse = Struct.new(:keys, :limit, :offset, :ok, :total, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] daily_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] daily_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] monthly_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] monthly_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] prefix
    #   @return [String]
    # @!attribute [rw] scopes
    #   @return [Array<String>]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] weekly_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] weekly_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    ManagementKeyRuntime = Struct.new(:created_at, :created_by, :daily_limit_cost_nanos, :daily_limit_requests, :expires_at, :id, :last_used_at, :monthly_limit_cost_nanos, :monthly_limit_requests, :name, :prefix, :scopes, :soft_blocked, :status, :updated_at, :weekly_limit_cost_nanos, :weekly_limit_requests, :workspace_id, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] daily_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] daily_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] key
    #   @return [String]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] monthly_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] monthly_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] prefix
    #   @return [String]
    # @!attribute [rw] scopes
    #   @return [Array<String>]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] weekly_limit_cost_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] weekly_limit_requests
    #   @return [Integer, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    ManagementKeyRuntimeCreated = Struct.new(:created_at, :created_by, :daily_limit_cost_nanos, :daily_limit_requests, :expires_at, :id, :key, :last_used_at, :monthly_limit_cost_nanos, :monthly_limit_requests, :name, :prefix, :scopes, :soft_blocked, :status, :updated_at, :weekly_limit_cost_nanos, :weekly_limit_requests, :workspace_id, keyword_init: true)
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] paused
    #   @return [Boolean, nil]
    # @!attribute [rw] scopes
    #   @return [String, Array<String>, nil]
    # @!attribute [rw] template
    #   @return [String, nil]
    ManagementKeyRuntimeCreateRequest = Struct.new(:expires_at, :name, :paused, :scopes, :template, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    ManagementKeyRuntimeCreateResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] deleted
    #   @return [String]
    ManagementKeyRuntimeDeleteResponse = Struct.new(:deleted, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    ManagementKeyRuntimeResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] dailyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] dailyRequests
    #   @return [Integer, nil]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] monthlyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] monthlyRequests
    #   @return [Integer, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] paused
    #   @return [Boolean, nil]
    # @!attribute [rw] scopes
    #   @return [String, Array<String>, nil]
    # @!attribute [rw] softBlocked
    #   @return [Boolean, nil]
    # @!attribute [rw] template
    #   @return [String, nil]
    # @!attribute [rw] weeklyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] weeklyRequests
    #   @return [Integer, nil]
    ManagementKeyRuntimeUpdateRequest = Struct.new(:dailyCostNanos, :dailyRequests, :expires_at, :monthlyCostNanos, :monthlyRequests, :name, :paused, :scopes, :softBlocked, :template, :weeklyCostNanos, :weeklyRequests, keyword_init: true)
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    ManagementKeyUpdateRequest = Struct.new(:name, :soft_blocked, :status, keyword_init: true)
    # @!attribute [rw] message
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    ManagementKeyUpdateResponse = Struct.new(:message, :ok, keyword_init: true)
    MessageContentPart = Object
    # @!attribute [rw] aliases
    #   @return [Array<String>]
    # @!attribute [rw] availability
    #   @return [Hash{String => Object}]
    # @!attribute [rw] base_model_id
    #   @return [String]
    # @!attribute [rw] capabilities
    #   @return [Hash{String => Object}]
    # @!attribute [rw] description
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] lifecycle
    #   @return [Hash{String => Object}]
    # @!attribute [rw] limits
    #   @return [Hash{String => Object}]
    # @!attribute [rw] modalities
    #   @return [Hash{String => Object}]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] offers
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] organization
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] pricing
    #   @return [Hash{String => Object}]
    # @!attribute [rw] variant
    #   @return [String]
    # @!attribute [rw] variants
    #   @return [Hash{String => Object}]
    Model = Struct.new(:aliases, :availability, :base_model_id, :capabilities, :description, :id, :lifecycle, :limits, :modalities, :name, :offers, :organization, :pricing, :variant, :variants, keyword_init: true)
    # @!attribute [rw] active_provider_count
    #   @return [Integer]
    # @!attribute [rw] coming_soon_provider_count
    #   @return [Integer]
    # @!attribute [rw] inactive_provider_count
    #   @return [Integer]
    # @!attribute [rw] provider_count
    #   @return [Integer]
    # @!attribute [rw] status
    #   @return [String]
    ModelAvailability = Struct.new(:active_provider_count, :coming_soon_provider_count, :inactive_provider_count, :provider_count, :status, keyword_init: true)
    # @!attribute [rw] capabilities
    #   @return [Hash{String => Object}]
    # @!attribute [rw] capability_id
    #   @return [String]
    # @!attribute [rw] collection
    #   @return [String]
    # @!attribute [rw] effective
    #   @return [Hash{String => Object}]
    # @!attribute [rw] endpoint
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] modalities
    #   @return [Hash{String => Object}]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] pricing
    #   @return [Hash{String => Object}]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}]
    # @!attribute [rw] public_path
    #   @return [String]
    # @!attribute [rw] routable
    #   @return [Boolean]
    # @!attribute [rw] routing
    #   @return [Hash{String => Object}]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] status_reason
    #   @return [String]
    ModelEndpointCapability = Struct.new(:capabilities, :capability_id, :collection, :effective, :endpoint, :id, :modalities, :model, :pricing, :provider, :public_path, :routable, :routing, :status, :status_reason, keyword_init: true)
    # @!attribute [rw] availability_mode
    #   @return [String]
    # @!attribute [rw] description
    #   @return [String]
    # @!attribute [rw] endpoints
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] modalities
    #   @return [Hash{String => Object}]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    # @!attribute [rw] organization
    #   @return [Hash{String => Object}, nil]
    ModelEndpointsResponse = Struct.new(:availability_mode, :description, :endpoints, :id, :modalities, :name, :ok, :organization, keyword_init: true)
    ModelId = Object
    # @!attribute [rw] deprecation_date
    #   @return [String, nil]
    # @!attribute [rw] message
    #   @return [String, nil]
    # @!attribute [rw] replacement_model_id
    #   @return [String, nil]
    # @!attribute [rw] retirement_date
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    ModelLifecycle = Struct.new(:deprecation_date, :message, :replacement_model_id, :retirement_date, :status, keyword_init: true)
    # @!attribute [rw] api_provider_id
    #   @return [String]
    # @!attribute [rw] api_provider_name
    #   @return [String, nil]
    # @!attribute [rw] availability_reason
    #   @return [String]
    # @!attribute [rw] availability_status
    #   @return [String]
    # @!attribute [rw] capability_status
    #   @return [String]
    # @!attribute [rw] effective_from
    #   @return [String, nil]
    # @!attribute [rw] effective_to
    #   @return [String, nil]
    # @!attribute [rw] endpoints
    #   @return [Array<String>]
    # @!attribute [rw] input_modalities
    #   @return [Array<String>, nil]
    # @!attribute [rw] is_active_gateway
    #   @return [Boolean]
    # @!attribute [rw] model_routing_status
    #   @return [String]
    # @!attribute [rw] output_modalities
    #   @return [Array<String>, nil]
    # @!attribute [rw] params
    #   @return [Array<String>]
    # @!attribute [rw] params_detail
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_model_slug
    #   @return [String, nil]
    # @!attribute [rw] provider_routing_status
    #   @return [String]
    # @!attribute [rw] provider_status
    #   @return [String]
    # @!attribute [rw] supported_parameters
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_parameters_detail
    #   @return [Hash{String => Object}, nil]
    ModelProviderAvailability = Struct.new(:api_provider_id, :api_provider_name, :availability_reason, :availability_status, :capability_status, :effective_from, :effective_to, :endpoints, :input_modalities, :is_active_gateway, :model_routing_status, :output_modalities, :params, :params_detail, :provider_model_slug, :provider_routing_status, :provider_status, :supported_parameters, :supported_parameters_detail, keyword_init: true)
    # @!attribute [rw] harassment
    #   @return [Boolean, nil]
    # @!attribute [rw] harassment_threatening
    #   @return [Boolean, nil]
    # @!attribute [rw] hate
    #   @return [Boolean, nil]
    # @!attribute [rw] hate_threatening
    #   @return [Boolean, nil]
    # @!attribute [rw] self_harm
    #   @return [Boolean, nil]
    # @!attribute [rw] self_harm_instructions
    #   @return [Boolean, nil]
    # @!attribute [rw] self_harm_intent
    #   @return [Boolean, nil]
    # @!attribute [rw] sexual
    #   @return [Boolean, nil]
    # @!attribute [rw] sexual_minors
    #   @return [Boolean, nil]
    # @!attribute [rw] violence
    #   @return [Boolean, nil]
    # @!attribute [rw] violence_graphic
    #   @return [Boolean, nil]
    ModerationCategories = Struct.new(:harassment, :harassment_threatening, :hate, :hate_threatening, :self_harm, :self_harm_instructions, :self_harm_intent, :sexual, :sexual_minors, :violence, :violence_graphic, keyword_init: true)
    # @!attribute [rw] harassment
    #   @return [Float, nil]
    # @!attribute [rw] harassment_threatening
    #   @return [Float, nil]
    # @!attribute [rw] hate
    #   @return [Float, nil]
    # @!attribute [rw] hate_threatening
    #   @return [Float, nil]
    # @!attribute [rw] self_harm
    #   @return [Float, nil]
    # @!attribute [rw] self_harm_instructions
    #   @return [Float, nil]
    # @!attribute [rw] self_harm_intent
    #   @return [Float, nil]
    # @!attribute [rw] sexual
    #   @return [Float, nil]
    # @!attribute [rw] sexual_minors
    #   @return [Float, nil]
    # @!attribute [rw] violence
    #   @return [Float, nil]
    # @!attribute [rw] violence_graphic
    #   @return [Float, nil]
    ModerationCategoryScores = Struct.new(:harassment, :harassment_threatening, :hate, :hate_threatening, :self_harm, :self_harm_instructions, :self_harm_intent, :sexual, :sexual_minors, :violence, :violence_graphic, keyword_init: true)
    # @!attribute [rw] categories
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] category_scores
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] flagged
    #   @return [Boolean, nil]
    ModerationResult = Struct.new(:categories, :category_scores, :flagged, keyword_init: true)
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] input
    #   @return [String, Array<Hash{String => Object}>]
    # @!attribute [rw] meta
    #   @return [Boolean, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    ModerationsRequest = Struct.new(:debug, :input, :meta, :model, :provider, keyword_init: true)
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] meta
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] results
    #   @return [Array<Hash{String => Object}>, nil]
    ModerationsResponse = Struct.new(:id, :meta, :model, :results, keyword_init: true)
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] duration
    #   @return [Integer, nil]
    # @!attribute [rw] echo_upstream_request
    #   @return [Boolean, nil]
    # @!attribute [rw] elevenlabs
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] format
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] prompt
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] suno
    #   @return [Hash{String => Object}, nil]
    MusicGenerateRequest = Struct.new(:debug, :duration, :echo_upstream_request, :elevenlabs, :format, :model, :prompt, :provider, :suno, keyword_init: true)
    # @!attribute [rw] audio_base64
    #   @return [String, nil]
    # @!attribute [rw] audio_url
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] nativeResponseId
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String]
    # @!attribute [rw] output
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] provider
    #   @return [String]
    # @!attribute [rw] result
    #   @return [Object, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    MusicGenerateResponse = Struct.new(:audio_base64, :audio_url, :id, :model, :nativeResponseId, :object, :output, :provider, :result, :status, :usage, keyword_init: true)
    # @!attribute [rw] description
    #   @return [String]
    # @!attribute [rw] error
    #   @return [String]
    # @!attribute [rw] status_code
    #   @return [Integer]
    NotImplementedResponse = Struct.new(:description, :error, :status_code, keyword_init: true)
    # @!attribute [rw] active_authorizations
    #   @return [Integer, nil]
    # @!attribute [rw] allowed_scopes
    #   @return [Array<String>, nil]
    # @!attribute [rw] client_id
    #   @return [String]
    # @!attribute [rw] client_type
    #   @return [String]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] homepage_url
    #   @return [String, nil]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] logo_url
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] privacy_policy_url
    #   @return [String, nil]
    # @!attribute [rw] redirect_uris
    #   @return [Array<String>]
    # @!attribute [rw] requests_last_30d
    #   @return [Integer, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] terms_of_service_url
    #   @return [String, nil]
    # @!attribute [rw] total_authorizations
    #   @return [Integer, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    OAuthClient = Struct.new(:active_authorizations, :allowed_scopes, :client_id, :client_type, :created_at, :description, :homepage_url, :last_used_at, :logo_url, :name, :privacy_policy_url, :redirect_uris, :requests_last_30d, :status, :terms_of_service_url, :total_authorizations, :updated_at, :workspace_id, keyword_init: true)
    # @!attribute [rw] allowed_scopes
    #   @return [Array<String>, nil]
    # @!attribute [rw] client_type
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] homepage_url
    #   @return [String, nil]
    # @!attribute [rw] logo_url
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] privacy_policy_url
    #   @return [String, nil]
    # @!attribute [rw] redirect_uris
    #   @return [Array<String>]
    # @!attribute [rw] terms_of_service_url
    #   @return [String, nil]
    OAuthClientCreateRequest = Struct.new(:allowed_scopes, :client_type, :description, :homepage_url, :logo_url, :name, :privacy_policy_url, :redirect_uris, :terms_of_service_url, keyword_init: true)
    # @!attribute [rw] active_authorizations
    #   @return [Integer, nil]
    # @!attribute [rw] allowed_scopes
    #   @return [Array<String>, nil]
    # @!attribute [rw] client_id
    #   @return [String]
    # @!attribute [rw] client_secret
    #   @return [String, nil]
    # @!attribute [rw] client_type
    #   @return [String]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] homepage_url
    #   @return [String, nil]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] logo_url
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] privacy_policy_url
    #   @return [String, nil]
    # @!attribute [rw] redirect_uris
    #   @return [Array<String>]
    # @!attribute [rw] requests_last_30d
    #   @return [Integer, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] terms_of_service_url
    #   @return [String, nil]
    # @!attribute [rw] total_authorizations
    #   @return [Integer, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    OAuthClientCreateResponse = Struct.new(:active_authorizations, :allowed_scopes, :client_id, :client_secret, :client_type, :created_at, :description, :homepage_url, :last_used_at, :logo_url, :name, :privacy_policy_url, :redirect_uris, :requests_last_30d, :status, :terms_of_service_url, :total_authorizations, :updated_at, :workspace_id, keyword_init: true)
    # @!attribute [rw] client_id
    #   @return [String]
    # @!attribute [rw] message
    #   @return [String]
    OAuthClientDeleteResponse = Struct.new(:client_id, :message, keyword_init: true)
    # @!attribute [rw] allowed_scopes
    #   @return [Array<String>, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] homepage_url
    #   @return [String, nil]
    # @!attribute [rw] logo_url
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] privacy_policy_url
    #   @return [String, nil]
    # @!attribute [rw] redirect_uris
    #   @return [Array<String>, nil]
    # @!attribute [rw] terms_of_service_url
    #   @return [String, nil]
    OAuthClientInput = Struct.new(:allowed_scopes, :description, :homepage_url, :logo_url, :name, :privacy_policy_url, :redirect_uris, :terms_of_service_url, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] pagination
    #   @return [Hash{String => Object}]
    OAuthClientListResponse = Struct.new(:data, :pagination, keyword_init: true)
    # @!attribute [rw] client_id
    #   @return [String]
    # @!attribute [rw] client_secret
    #   @return [String]
    # @!attribute [rw] message
    #   @return [String]
    OAuthClientSecretResponse = Struct.new(:client_id, :client_secret, :message, keyword_init: true)
    # @!attribute [rw] allowed_scopes
    #   @return [Array<String>, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] homepage_url
    #   @return [String, nil]
    # @!attribute [rw] logo_url
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] privacy_policy_url
    #   @return [String, nil]
    # @!attribute [rw] redirect_uris
    #   @return [Array<String>, nil]
    # @!attribute [rw] terms_of_service_url
    #   @return [String, nil]
    OAuthClientUpdateRequest = Struct.new(:allowed_scopes, :description, :homepage_url, :logo_url, :name, :privacy_policy_url, :redirect_uris, :terms_of_service_url, keyword_init: true)
    # @!attribute [rw] configured
    #   @return [Boolean]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] group_join
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] include_cost_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_generation_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_identity_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_request_context
    #   @return [Boolean, nil]
    # @!attribute [rw] key_filters
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] privacy_mode
    #   @return [Boolean]
    # @!attribute [rw] rule_groups
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] sampling_rate
    #   @return [Float]
    # @!attribute [rw] type
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    ObservabilityDestination = Struct.new(:configured, :created_at, :enabled, :group_join, :id, :include_cost_metadata, :include_generation_metadata, :include_identity_metadata, :include_request_context, :key_filters, :name, :privacy_mode, :rule_groups, :sampling_rate, :type, :updated_at, :workspace_id, keyword_init: true)
    # @!attribute [rw] config
    #   @return [Hash{String => Object}]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] group_join
    #   @return [String, nil]
    # @!attribute [rw] include_cost_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_generation_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_identity_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_request_context
    #   @return [Boolean, nil]
    # @!attribute [rw] key_filters
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] privacy_mode
    #   @return [Boolean, nil]
    # @!attribute [rw] rule_groups
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] sampling_rate
    #   @return [Float, nil]
    # @!attribute [rw] type
    #   @return [String]
    ObservabilityDestinationCreateRequest = Struct.new(:config, :enabled, :group_join, :include_cost_metadata, :include_generation_metadata, :include_identity_metadata, :include_request_context, :key_filters, :name, :privacy_mode, :rule_groups, :sampling_rate, :type, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    ObservabilityDestinationListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] group_join
    #   @return [String, nil]
    # @!attribute [rw] include_cost_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_generation_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_identity_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_request_context
    #   @return [Boolean, nil]
    # @!attribute [rw] key_filters
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] privacy_mode
    #   @return [Boolean, nil]
    # @!attribute [rw] rule_groups
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] sampling_rate
    #   @return [Float, nil]
    ObservabilityDestinationPolicyInput = Struct.new(:enabled, :group_join, :include_cost_metadata, :include_generation_metadata, :include_identity_metadata, :include_request_context, :key_filters, :name, :privacy_mode, :rule_groups, :sampling_rate, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    ObservabilityDestinationResponse = Struct.new(:data, keyword_init: true)
    ObservabilityDestinationType = Object
    # @!attribute [rw] config
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] group_join
    #   @return [String, nil]
    # @!attribute [rw] include_cost_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_generation_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_identity_metadata
    #   @return [Boolean, nil]
    # @!attribute [rw] include_request_context
    #   @return [Boolean, nil]
    # @!attribute [rw] key_filters
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] privacy_mode
    #   @return [Boolean, nil]
    # @!attribute [rw] rule_groups
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] sampling_rate
    #   @return [Float, nil]
    ObservabilityDestinationUpdateRequest = Struct.new(:config, :enabled, :group_join, :include_cost_metadata, :include_generation_metadata, :include_identity_metadata, :include_request_context, :key_filters, :name, :privacy_mode, :rule_groups, :sampling_rate, keyword_init: true)
    # @!attribute [rw] key_id
    #   @return [String]
    # @!attribute [rw] mode
    #   @return [String]
    ObservabilityKeyFilter = Struct.new(:key_id, :mode, keyword_init: true)
    # @!attribute [rw] billing_status
    #   @return [String]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] grace_until
    #   @return [String, nil]
    # @!attribute [rw] include_provider_payloads
    #   @return [Boolean]
    # @!attribute [rw] price_per_million_units_nanos
    #   @return [Integer]
    # @!attribute [rw] retention_days
    #   @return [Integer]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    ObservabilityLoggingPolicy = Struct.new(:billing_status, :enabled, :grace_until, :include_provider_payloads, :price_per_million_units_nanos, :retention_days, :updated_at, :workspace_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    ObservabilityLoggingPolicyResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] include_provider_payloads
    #   @return [Boolean, nil]
    # @!attribute [rw] retention_days
    #   @return [Integer, nil]
    ObservabilityLoggingPolicyUpdateRequest = Struct.new(:enabled, :include_provider_payloads, :retention_days, keyword_init: true)
    # @!attribute [rw] condition
    #   @return [String]
    # @!attribute [rw] field
    #   @return [String]
    # @!attribute [rw] value
    #   @return [String, nil]
    ObservabilityRule = Struct.new(:condition, :field, :value, keyword_init: true)
    # @!attribute [rw] match
    #   @return [String]
    # @!attribute [rw] rules
    #   @return [Array<Hash{String => Object}>]
    ObservabilityRuleGroup = Struct.new(:match, :rules, keyword_init: true)
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] echo_upstream_request
    #   @return [Boolean, nil]
    # @!attribute [rw] image
    #   @return [String]
    # @!attribute [rw] language
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    OcrRequest = Struct.new(:debug, :echo_upstream_request, :image, :language, :model, :provider, keyword_init: true)
    OcrResponse = Struct.new(:_unused, keyword_init: true)
    OrganisationId = Object
    OrganisationIdList = Object
    ParseBlock = Object
    # @!attribute [rw] bottom_right_x
    #   @return [Float]
    # @!attribute [rw] bottom_right_y
    #   @return [Float]
    # @!attribute [rw] top_left_x
    #   @return [Float]
    # @!attribute [rw] top_left_y
    #   @return [Float]
    ParseBoundingBox = Struct.new(:bottom_right_x, :bottom_right_y, :top_left_x, :top_left_y, keyword_init: true)
    # @!attribute [rw] bounding_box
    #   @return [Hash{String => Object}]
    # @!attribute [rw] bounding_box_normalized
    #   @return [Hash{String => Object}]
    # @!attribute [rw] category
    #   @return [String]
    # @!attribute [rw] description
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    ParseImage = Struct.new(:bounding_box, :bounding_box_normalized, :category, :description, :id, keyword_init: true)
    ParsePage = Object
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] document
    #   @return [Hash{String => Object}]
    # @!attribute [rw] echo_upstream_request
    #   @return [Boolean, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] output_format
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] routing
    #   @return [Hash{String => Object}, nil]
    ParseRequest = Struct.new(:debug, :document, :echo_upstream_request, :model, :output_format, :provider, :routing, keyword_init: true)
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] meta
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] object
    #   @return [String]
    # @!attribute [rw] pages
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] provider
    #   @return [String]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    ParseResponse = Struct.new(:id, :meta, :model, :object, :pages, :provider, :usage, keyword_init: true)
    # @!attribute [rw] active_version_id
    #   @return [String, nil]
    # @!attribute [rw] config
    #   @return [Hash{String => Object}]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] slug
    #   @return [String]
    # @!attribute [rw] source_preset_id
    #   @return [String, nil]
    # @!attribute [rw] source_preset_version_id
    #   @return [String, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] upstream_version_id
    #   @return [String, nil]
    # @!attribute [rw] versioning_method
    #   @return [String]
    # @!attribute [rw] visibility
    #   @return [String]
    # @!attribute [rw] workspace_id
    #   @return [String]
    Preset = Struct.new(:active_version_id, :config, :created_at, :created_by, :description, :id, :name, :slug, :source_preset_id, :source_preset_version_id, :updated_at, :upstream_version_id, :versioning_method, :visibility, :workspace_id, keyword_init: true)
    PresetConfig = Struct.new(:_unused, keyword_init: true)
    # @!attribute [rw] config
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] slug
    #   @return [String, nil]
    # @!attribute [rw] versioning_method
    #   @return [String, nil]
    # @!attribute [rw] visibility
    #   @return [String, nil]
    PresetCreateRequest = Struct.new(:config, :description, :name, :slug, :versioning_method, :visibility, keyword_init: true)
    # @!attribute [rw] canonical_model
    #   @return [String]
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    PresetCreateResponse = Struct.new(:canonical_model, :data, keyword_init: true)
    # @!attribute [rw] source_version_id
    #   @return [String, nil]
    PresetForkRequest = Struct.new(:source_version_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    PresetListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] handle
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    PresetPublisher = Struct.new(:handle, :workspace_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    PresetPublisherResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] handle
    #   @return [String]
    PresetPublisherUpdateRequest = Struct.new(:handle, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    PresetResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] baseline_preset_id
    #   @return [String, nil]
    # @!attribute [rw] completed_at
    #   @return [String, nil]
    # @!attribute [rw] config
    #   @return [Hash{String => Object}]
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] created_by_user_id
    #   @return [String, nil]
    # @!attribute [rw] dataset_name
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] preset_id
    #   @return [String, nil]
    # @!attribute [rw] started_at
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] summary
    #   @return [Hash{String => Object}]
    # @!attribute [rw] updated_at
    #   @return [String]
    # @!attribute [rw] workspace_id
    #   @return [String]
    PresetTestRun = Struct.new(:baseline_preset_id, :completed_at, :config, :created_at, :created_by_user_id, :dataset_name, :description, :id, :name, :preset_id, :started_at, :status, :summary, :updated_at, :workspace_id, keyword_init: true)
    # @!attribute [rw] baseline_preset_id
    #   @return [String, nil]
    # @!attribute [rw] completed_at
    #   @return [String, nil]
    # @!attribute [rw] config
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] dataset_name
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] preset_id
    #   @return [String, nil]
    # @!attribute [rw] started_at
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] summary
    #   @return [Hash{String => Object}, nil]
    PresetTestRunCreateRequest = Struct.new(:baseline_preset_id, :completed_at, :config, :dataset_name, :description, :name, :preset_id, :started_at, :status, :summary, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    # @!attribute [rw] feedback_summary
    #   @return [Hash{String => Object}, nil]
    PresetTestRunDetailResponse = Struct.new(:data, :feedback_summary, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    PresetTestRunListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    PresetTestRunResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] completed_at
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] started_at
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] summary
    #   @return [Hash{String => Object}, nil]
    PresetTestRunUpdateRequest = Struct.new(:completed_at, :description, :name, :started_at, :status, :summary, keyword_init: true)
    # @!attribute [rw] config
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] replace_config
    #   @return [Boolean, nil]
    # @!attribute [rw] slug
    #   @return [String, nil]
    # @!attribute [rw] versioning_method
    #   @return [String, nil]
    # @!attribute [rw] visibility
    #   @return [String, nil]
    PresetUpdateRequest = Struct.new(:config, :description, :name, :replace_config, :slug, :versioning_method, :visibility, keyword_init: true)
    # @!attribute [rw] version_id
    #   @return [String]
    PresetUpstreamApplyRequest = Struct.new(:version_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    PresetUpstreamApplyResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] config
    #   @return [Hash{String => Object}]
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] created_by
    #   @return [String]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] preset_id
    #   @return [String]
    # @!attribute [rw] release_notes
    #   @return [String, nil]
    # @!attribute [rw] slug
    #   @return [String]
    # @!attribute [rw] version_label
    #   @return [String]
    # @!attribute [rw] version_number
    #   @return [Integer]
    # @!attribute [rw] versioning_method
    #   @return [String]
    # @!attribute [rw] visibility
    #   @return [String]
    PresetVersion = Struct.new(:config, :created_at, :created_by, :description, :id, :name, :preset_id, :release_notes, :slug, :version_label, :version_number, :versioning_method, :visibility, keyword_init: true)
    PresetVersioningMethod = Object
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    PresetVersionListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] release_notes
    #   @return [String, nil]
    # @!attribute [rw] version_label
    #   @return [String, nil]
    PresetVersionPublishRequest = Struct.new(:release_notes, :version_label, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    PresetVersionResponse = Struct.new(:data, keyword_init: true)
    PresetVisibility = Object
    # @!attribute [rw] base_url
    #   @return [String]
    # @!attribute [rw] catalog_model_id
    #   @return [String, nil]
    # @!attribute [rw] context_length
    #   @return [Integer, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] credential_prefix
    #   @return [String, nil]
    # @!attribute [rw] credential_suffix
    #   @return [String, nil]
    # @!attribute [rw] custom_provider_name
    #   @return [String, nil]
    # @!attribute [rw] custom_provider_url
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] host_provider_id
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] input_modalities
    #   @return [Array<String>, nil]
    # @!attribute [rw] local_slug
    #   @return [String, nil]
    # @!attribute [rw] max_output_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] model_id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] output_modalities
    #   @return [Array<String>, nil]
    # @!attribute [rw] routing_policy
    #   @return [String, nil]
    # @!attribute [rw] supports_responses
    #   @return [Boolean]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] upstream_model_id
    #   @return [String]
    # @!attribute [rw] workspace_id
    #   @return [String]
    PrivateModel = Struct.new(:base_url, :catalog_model_id, :context_length, :created_at, :created_by, :credential_prefix, :credential_suffix, :custom_provider_name, :custom_provider_url, :description, :enabled, :host_provider_id, :id, :input_modalities, :local_slug, :max_output_tokens, :model_id, :name, :output_modalities, :routing_policy, :supports_responses, :updated_at, :upstream_model_id, :workspace_id, keyword_init: true)
    # @!attribute [rw] base_url
    #   @return [String]
    # @!attribute [rw] context_length
    #   @return [Integer, nil]
    # @!attribute [rw] credential
    #   @return [String]
    # @!attribute [rw] custom_provider_name
    #   @return [String, nil]
    # @!attribute [rw] custom_provider_url
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] host_provider_id
    #   @return [String, nil]
    # @!attribute [rw] max_output_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] model_reference
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] routing_policy
    #   @return [String, nil]
    # @!attribute [rw] supports_responses
    #   @return [Boolean, nil]
    # @!attribute [rw] upstream_model_id
    #   @return [String]
    PrivateModelCreateRequest = Struct.new(:base_url, :context_length, :credential, :custom_provider_name, :custom_provider_url, :description, :enabled, :host_provider_id, :max_output_tokens, :model_reference, :name, :routing_policy, :supports_responses, :upstream_model_id, keyword_init: true)
    # @!attribute [rw] deleted
    #   @return [Boolean]
    PrivateModelDeleteResponse = Struct.new(:deleted, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    PrivateModelListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    PrivateModelResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] base_url
    #   @return [String, nil]
    # @!attribute [rw] context_length
    #   @return [Integer, nil]
    # @!attribute [rw] credential
    #   @return [String, nil]
    # @!attribute [rw] custom_provider_name
    #   @return [String, nil]
    # @!attribute [rw] custom_provider_url
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] host_provider_id
    #   @return [String, nil]
    # @!attribute [rw] max_output_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] model_reference
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] routing_policy
    #   @return [String, nil]
    # @!attribute [rw] supports_responses
    #   @return [Boolean, nil]
    # @!attribute [rw] upstream_model_id
    #   @return [String, nil]
    PrivateModelUpdateRequest = Struct.new(:base_url, :context_length, :credential, :custom_provider_name, :custom_provider_url, :description, :enabled, :host_provider_id, :max_output_tokens, :model_reference, :name, :routing_policy, :supports_responses, :upstream_model_id, keyword_init: true)
    # @!attribute [rw] api_provider_id
    #   @return [String, nil]
    # @!attribute [rw] api_provider_name
    #   @return [String, nil]
    # @!attribute [rw] country_code
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] link
    #   @return [String, nil]
    Provider = Struct.new(:api_provider_id, :api_provider_name, :country_code, :description, :link, keyword_init: true)
    # @!attribute [rw] allowed_api_key_ids
    #   @return [Array<String>, nil]
    # @!attribute [rw] allowed_model_slugs
    #   @return [Array<String>, nil]
    # @!attribute [rw] always_use
    #   @return [Boolean, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] disabled
    #   @return [Boolean]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] error_message
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] is_fallback
    #   @return [Boolean]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] last_verified_at
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] provider_id
    #   @return [String]
    # @!attribute [rw] routing_mode
    #   @return [String]
    # @!attribute [rw] sort_order
    #   @return [Integer]
    # @!attribute [rw] suffix
    #   @return [String, nil]
    # @!attribute [rw] verification_status
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    ProviderCredential = Struct.new(:allowed_api_key_ids, :allowed_model_slugs, :always_use, :created_at, :created_by, :disabled, :enabled, :error_message, :id, :is_fallback, :last_used_at, :last_verified_at, :name, :prefix, :provider_id, :routing_mode, :sort_order, :suffix, :verification_status, :workspace_id, keyword_init: true)
    # @!attribute [rw] allowed_api_key_ids
    #   @return [Array<String>, nil]
    # @!attribute [rw] allowed_models
    #   @return [Array<String>, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] key
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [String]
    # @!attribute [rw] routing_mode
    #   @return [String, nil]
    ProviderCredentialCreateRequest = Struct.new(:allowed_api_key_ids, :allowed_models, :enabled, :key, :name, :provider, :routing_mode, keyword_init: true)
    # @!attribute [rw] deleted
    #   @return [Boolean]
    ProviderCredentialDeleteResponse = Struct.new(:deleted, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    ProviderCredentialListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] key_ids
    #   @return [Array<String>]
    # @!attribute [rw] provider
    #   @return [String]
    # @!attribute [rw] routing_mode
    #   @return [String]
    ProviderCredentialReorderRequest = Struct.new(:key_ids, :provider, :routing_mode, keyword_init: true)
    # @!attribute [rw] reordered
    #   @return [Boolean]
    ProviderCredentialReorderResponse = Struct.new(:reordered, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    ProviderCredentialResponse = Struct.new(:data, keyword_init: true)
    ProviderCredentialRoutingMode = Object
    # @!attribute [rw] allowed_api_key_ids
    #   @return [Array<String>, nil]
    # @!attribute [rw] allowed_models
    #   @return [Array<String>, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] key
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] routing_mode
    #   @return [String, nil]
    ProviderCredentialUpdateRequest = Struct.new(:allowed_api_key_ids, :allowed_models, :enabled, :key, :name, :routing_mode, keyword_init: true)
    # @!attribute [rw] anthropic
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] google
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] openai
    #   @return [Hash{String => Object}, nil]
    ProviderOptions = Struct.new(:anthropic, :google, :openai, keyword_init: true)
    # @!attribute [rw] allow_fallbacks
    #   @return [Boolean, nil]
    # @!attribute [rw] data_collection
    #   @return [String, nil]
    # @!attribute [rw] enforce_distillable_text
    #   @return [Boolean, nil]
    # @!attribute [rw] ignore
    #   @return [Array<String>, nil]
    # @!attribute [rw] include_alpha
    #   @return [Boolean, nil]
    # @!attribute [rw] max_price
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] only
    #   @return [Array<String>, nil]
    # @!attribute [rw] order
    #   @return [Array<String>, nil]
    # @!attribute [rw] preferred_max_latency
    #   @return [Float, Hash{String => Object}, nil]
    # @!attribute [rw] preferred_min_throughput
    #   @return [Float, Hash{String => Object}, nil]
    # @!attribute [rw] quantizations
    #   @return [Array<String>, nil]
    # @!attribute [rw] require_parameters
    #   @return [Boolean, nil]
    # @!attribute [rw] require_zero_data_retention
    #   @return [Boolean, nil]
    # @!attribute [rw] required_data_region
    #   @return [String, nil]
    # @!attribute [rw] required_execution_region
    #   @return [String, nil]
    # @!attribute [rw] sort
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] zdr
    #   @return [Boolean, nil]
    ProviderRoutingOptions = Struct.new(:allow_fallbacks, :data_collection, :enforce_distillable_text, :ignore, :include_alpha, :max_price, :only, :order, :preferred_max_latency, :preferred_min_throughput, :quantizations, :require_parameters, :require_zero_data_retention, :required_data_region, :required_execution_region, :sort, :zdr, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] scopes
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    ProvisioningKey = Struct.new(:created_at, :id, :last_used_at, :name, :prefix, :scopes, :status, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] scopes
    #   @return [String, nil]
    # @!attribute [rw] soft_blocked
    #   @return [Boolean, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] team_id
    #   @return [String, nil]
    ProvisioningKeyDetail = Struct.new(:created_at, :created_by, :id, :last_used_at, :name, :prefix, :scopes, :soft_blocked, :status, :team_id, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] key
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] scopes
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    ProvisioningKeyWithValue = Struct.new(:created_at, :id, :key, :name, :prefix, :scopes, :status, keyword_init: true)
    # @!attribute [rw] effort
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] max_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] mode
    #   @return [String, nil]
    # @!attribute [rw] summary
    #   @return [String, nil]
    ReasoningConfig = Struct.new(:effort, :enabled, :max_tokens, :mode, :summary, keyword_init: true)
    RerankDocument = Object
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] documents
    #   @return [Array<String>, Array<Hash{String => Object}>]
    # @!attribute [rw] max_chunks_per_doc
    #   @return [Integer, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] query
    #   @return [String]
    # @!attribute [rw] rank_fields
    #   @return [Array<String>, nil]
    # @!attribute [rw] return_documents
    #   @return [Boolean, nil]
    # @!attribute [rw] top_k
    #   @return [Integer, nil]
    # @!attribute [rw] top_n
    #   @return [Integer, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    RerankRequest = Struct.new(:debug, :documents, :max_chunks_per_doc, :metadata, :model, :provider, :provider_options, :query, :rank_fields, :return_documents, :top_k, :top_n, :user, keyword_init: true)
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] nativeResponseId
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] results
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    RerankResponse = Struct.new(:id, :model, :nativeResponseId, :object, :results, :usage, keyword_init: true)
    # @!attribute [rw] document
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] index
    #   @return [Integer, nil]
    # @!attribute [rw] relevance_score
    #   @return [Float, nil]
    RerankResult = Struct.new(:document, :index, :relevance_score, keyword_init: true)
    # @!attribute [rw] content
    #   @return [String, Array<Hash{String => Object}>, Hash{String => Object}, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    ResponsesInputItem = Struct.new(:content, :role, :type, keyword_init: true)
    # @!attribute [rw] audio_url
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] b64_json
    #   @return [String, nil]
    # @!attribute [rw] format
    #   @return [String, nil]
    # @!attribute [rw] mime_type
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String]
    ResponsesOutputAudioPart = Struct.new(:audio_url, :b64_json, :format, :mime_type, :type, keyword_init: true)
    ResponsesOutputContentPart = Object
    # @!attribute [rw] b64_json
    #   @return [String, nil]
    # @!attribute [rw] image_url
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] mime_type
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String]
    ResponsesOutputImagePart = Struct.new(:b64_json, :image_url, :mime_type, :type, keyword_init: true)
    # @!attribute [rw] arguments
    #   @return [String, nil]
    # @!attribute [rw] call_id
    #   @return [String, nil]
    # @!attribute [rw] content
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    ResponsesOutputItem = Struct.new(:arguments, :call_id, :content, :name, :role, :type, keyword_init: true)
    # @!attribute [rw] annotations
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] text
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    ResponsesOutputTextPart = Struct.new(:annotations, :text, :type, keyword_init: true)
    # @!attribute [rw] background
    #   @return [Boolean, nil]
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] echo_upstream_request
    #   @return [Boolean, nil]
    # @!attribute [rw] image_config
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] include
    #   @return [Array<String>, nil]
    # @!attribute [rw] input
    #   @return [String, Array<Hash{String => Object}>, Hash{String => Object}]
    # @!attribute [rw] instructions
    #   @return [String, nil]
    # @!attribute [rw] max_output_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] meta
    #   @return [Boolean, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] modalities
    #   @return [Array<String>, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] parallel_tool_calls
    #   @return [Boolean, nil]
    # @!attribute [rw] previous_response_id
    #   @return [String, nil]
    # @!attribute [rw] prompt_cache_key
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] reasoning
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] safety_identifier
    #   @return [String, nil]
    # @!attribute [rw] service_tier
    #   @return [String, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] store
    #   @return [Boolean, nil]
    # @!attribute [rw] stream
    #   @return [Boolean, nil]
    # @!attribute [rw] temperature
    #   @return [Float, nil]
    # @!attribute [rw] text
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] tool_choice
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] tools
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] top_p
    #   @return [Float, nil]
    # @!attribute [rw] truncation
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Boolean, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    ResponsesRequest = Struct.new(:background, :debug, :echo_upstream_request, :image_config, :include, :input, :instructions, :max_output_tokens, :meta, :metadata, :modalities, :model, :parallel_tool_calls, :previous_response_id, :prompt_cache_key, :provider, :provider_options, :reasoning, :safety_identifier, :service_tier, :session_id, :store, :stream, :temperature, :text, :tool_choice, :tools, :top_p, :truncation, :usage, :user, keyword_init: true)
    # @!attribute [rw] content
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] cost_cents
    #   @return [Integer, nil]
    # @!attribute [rw] cost_nanos
    #   @return [Float, nil]
    # @!attribute [rw] created
    #   @return [Integer, nil]
    # @!attribute [rw] currency
    #   @return [String, nil]
    # @!attribute [rw] finish_reason
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] meta
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] nativeResponseId
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] output
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] output_items
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] pricing_lines
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] provider_id
    #   @return [String, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] stop_reason
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    ResponsesResponse = Struct.new(:content, :cost_cents, :cost_nanos, :created, :currency, :finish_reason, :id, :meta, :model, :nativeResponseId, :object, :output, :output_items, :pricing_lines, :provider, :provider_id, :role, :status, :stop_reason, :type, :usage, keyword_init: true)
    # @!attribute [rw] parameters
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] type
    #   @return [String]
    SearchModelsToolDefinition = Struct.new(:parameters, :type, keyword_init: true)
    # @!attribute [rw] advisor_requests
    #   @return [Integer, nil]
    # @!attribute [rw] apply_patch_requests
    #   @return [Integer, nil]
    # @!attribute [rw] datetime_requests
    #   @return [Integer, nil]
    # @!attribute [rw] fusion_requests
    #   @return [Integer, nil]
    # @!attribute [rw] image_generation_requests
    #   @return [Integer, nil]
    # @!attribute [rw] search_models_requests
    #   @return [Integer, nil]
    # @!attribute [rw] subagent_requests
    #   @return [Integer, nil]
    # @!attribute [rw] web_fetch_requests
    #   @return [Integer, nil]
    # @!attribute [rw] web_search_requests
    #   @return [Integer, nil]
    ServerToolUsage = Struct.new(:advisor_requests, :apply_patch_requests, :datetime_requests, :fusion_requests, :image_generation_requests, :search_models_requests, :subagent_requests, :web_fetch_requests, :web_search_requests, keyword_init: true)
    # @!attribute [rw] parameters
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] type
    #   @return [String]
    SubagentToolDefinition = Struct.new(:parameters, :type, keyword_init: true)
    SupportedParameterDetails = Struct.new(:_unused, keyword_init: true)
    # @!attribute [rw] text
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    TextContentPart = Struct.new(:text, :type, keyword_init: true)
    TextGenerateTool = Object
    # @!attribute [rw] text
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    TextModerationInput = Struct.new(:text, :type, keyword_init: true)
    TextToolChoice = Object
    # @!attribute [rw] function
    #   @return [Hash{String => Object}]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    ToolCall = Struct.new(:function, :id, :type, keyword_init: true)
    # @!attribute [rw] function
    #   @return [Hash{String => Object}]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    ToolCallContentPart = Struct.new(:function, :id, :type, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    UpdatedResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] completion_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] prompt_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] server_tool_use
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] total_tokens
    #   @return [Integer, nil]
    Usage = Struct.new(:completion_tokens, :prompt_tokens, :server_tool_use, :total_tokens, keyword_init: true)
    # @!attribute [rw] billable
    #   @return [Boolean, nil]
    # @!attribute [rw] billed_at
    #   @return [String, nil]
    # @!attribute [rw] charge_reason
    #   @return [String, nil]
    # @!attribute [rw] charged
    #   @return [Boolean, nil]
    # @!attribute [rw] currency
    #   @return [String, nil]
    # @!attribute [rw] estimated_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] estimated_provider_cost
    #   @return [String, nil]
    # @!attribute [rw] estimated_user_cost
    #   @return [String, nil]
    # @!attribute [rw] reservation_id
    #   @return [String, nil]
    # @!attribute [rw] reservation_status
    #   @return [String, nil]
    # @!attribute [rw] reserved_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] settled_provider_cost
    #   @return [String, nil]
    # @!attribute [rw] settled_user_cost
    #   @return [String, nil]
    # @!attribute [rw] state
    #   @return [String, nil]
    # @!attribute [rw] total_nanos
    #   @return [Integer, nil]
    VideoBillingSummary = Struct.new(:billable, :billed_at, :charge_reason, :charged, :currency, :estimated_nanos, :estimated_provider_cost, :estimated_user_cost, :reservation_id, :reservation_status, :reserved_nanos, :settled_provider_cost, :settled_user_cost, :state, :total_nanos, keyword_init: true)
    # @!attribute [rw] type
    #   @return [String]
    # @!attribute [rw] video_url
    #   @return [String]
    VideoContentPart = Struct.new(:type, :video_url, keyword_init: true)
    # @!attribute [rw] deleted
    #   @return [Boolean, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    VideoDeleteResponse = Struct.new(:deleted, :id, :object, keyword_init: true)
    # @!attribute [rw] aspect_ratio
    #   @return [String, nil]
    # @!attribute [rw] compression_quality
    #   @return [Integer, nil]
    # @!attribute [rw] duration
    #   @return [Integer, nil]
    # @!attribute [rw] enhance_prompt
    #   @return [Boolean, nil]
    # @!attribute [rw] frame_images
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] generate_audio
    #   @return [Boolean, nil]
    # @!attribute [rw] input_audio_duration
    #   @return [Float, nil]
    # @!attribute [rw] input_references
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] input_video_duration
    #   @return [Float, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] negative_prompt
    #   @return [String, nil]
    # @!attribute [rw] output
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] person_generation
    #   @return [String, nil]
    # @!attribute [rw] prompt
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_params
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] resize_mode
    #   @return [String, nil]
    # @!attribute [rw] resolution
    #   @return [String, nil]
    # @!attribute [rw] sample_count
    #   @return [Integer, nil]
    # @!attribute [rw] seed
    #   @return [Integer, nil]
    # @!attribute [rw] size
    #   @return [String, nil]
    # @!attribute [rw] webhook
    #   @return [Hash{String => Object}, nil]
    VideoGenerationRequest = Struct.new(:aspect_ratio, :compression_quality, :duration, :enhance_prompt, :frame_images, :generate_audio, :input_audio_duration, :input_references, :input_video_duration, :model, :negative_prompt, :output, :person_generation, :prompt, :provider, :provider_options, :provider_params, :resize_mode, :resolution, :sample_count, :seed, :size, :webhook, keyword_init: true)
    # @!attribute [rw] asset
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] audio
    #   @return [Boolean, nil]
    # @!attribute [rw] billing
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] cancel_url
    #   @return [String, nil]
    # @!attribute [rw] completed_at
    #   @return [Integer, String, nil]
    # @!attribute [rw] content_url
    #   @return [String, nil]
    # @!attribute [rw] created_at
    #   @return [Integer, String, nil]
    # @!attribute [rw] download_url
    #   @return [String, nil]
    # @!attribute [rw] error
    #   @return [Object, nil]
    # @!attribute [rw] expires_at
    #   @return [Integer, nil]
    # @!attribute [rw] generation_id
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] last_webhook_dispatched_at
    #   @return [String, nil]
    # @!attribute [rw] last_webhook_progress
    #   @return [Float, nil]
    # @!attribute [rw] last_webhook_progress_at
    #   @return [String, nil]
    # @!attribute [rw] lifecycle_status
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] native_video_id
    #   @return [String, nil]
    # @!attribute [rw] next_webhook_retry_at
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] output_access
    #   @return [String, nil]
    # @!attribute [rw] outputs
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] poll_after_seconds
    #   @return [Integer, nil]
    # @!attribute [rw] polling_url
    #   @return [String, nil]
    # @!attribute [rw] progress
    #   @return [Integer, nil]
    # @!attribute [rw] progress_source
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] seconds
    #   @return [Float, nil]
    # @!attribute [rw] session_id
    #   @return [String, nil]
    # @!attribute [rw] size
    #   @return [String, nil]
    # @!attribute [rw] started_at
    #   @return [Integer, String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] webhook
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] websocket_url
    #   @return [String, nil]
    VideoGenerationResponse = Struct.new(:asset, :audio, :billing, :cancel_url, :completed_at, :content_url, :created_at, :download_url, :error, :expires_at, :generation_id, :id, :last_webhook_dispatched_at, :last_webhook_progress, :last_webhook_progress_at, :lifecycle_status, :model, :native_video_id, :next_webhook_retry_at, :object, :output_access, :outputs, :poll_after_seconds, :polling_url, :progress, :progress_source, :provider, :request_id, :seconds, :session_id, :size, :started_at, :status, :usage, :webhook, :websocket_url, keyword_init: true)
    VideoInputReference = Object
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] first_id
    #   @return [String, nil]
    # @!attribute [rw] has_more
    #   @return [Boolean, nil]
    # @!attribute [rw] last_id
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    VideoListResponse = Struct.new(:data, :first_id, :has_more, :last_id, :object, keyword_init: true)
    # @!attribute [rw] input_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] output_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] pricing
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] providers
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] supported_parameters
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_parameters_detail
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] supported_params
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_params_detail
    #   @return [Hash{String => Object}, nil]
    VideoModelCapability = Struct.new(:input_types, :model, :name, :output_types, :pricing, :providers, :status, :supported_parameters, :supported_parameters_detail, :supported_params, :supported_params_detail, keyword_init: true)
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] supported_parameters
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_parameters_detail
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] supported_params
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_params_detail
    #   @return [Hash{String => Object}, nil]
    VideoModelProviderCapability = Struct.new(:id, :supported_parameters, :supported_parameters_detail, :supported_params, :supported_params_detail, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    VideoModelsResponse = Struct.new(:data, :object, keyword_init: true)
    # @!attribute [rw] bytes_available
    #   @return [Boolean, nil]
    # @!attribute [rw] content_url
    #   @return [String, nil]
    # @!attribute [rw] download_url
    #   @return [String, nil]
    # @!attribute [rw] expires_at
    #   @return [Integer, nil]
    # @!attribute [rw] index
    #   @return [Integer, nil]
    # @!attribute [rw] mime_type
    #   @return [String, nil]
    VideoOutput = Struct.new(:bytes_available, :content_url, :download_url, :expires_at, :index, :mime_type, keyword_init: true)
    # @!attribute [rw] access
    #   @return [String, nil]
    VideoOutputConfig = Struct.new(:access, keyword_init: true)
    # @!attribute [rw] createdAt
    #   @return [String, nil]
    # @!attribute [rw] createdBy
    #   @return [String, nil]
    # @!attribute [rw] deletedAt
    #   @return [String, nil]
    # @!attribute [rw] events
    #   @return [Array<String>]
    # @!attribute [rw] hasSecret
    #   @return [Boolean]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] updatedAt
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String]
    # @!attribute [rw] workspaceId
    #   @return [String]
    WebhookEndpoint = Struct.new(:createdAt, :createdBy, :deletedAt, :events, :hasSecret, :id, :name, :status, :updatedAt, :url, :workspaceId, keyword_init: true)
    # @!attribute [rw] events
    #   @return [Array<String>, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String]
    WebhookEndpointCreateRequest = Struct.new(:events, :name, :url, keyword_init: true)
    # @!attribute [rw] deleted
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] object
    #   @return [String]
    WebhookEndpointDeleteResponse = Struct.new(:deleted, :id, :object, keyword_init: true)
    # @!attribute [rw] events
    #   @return [Array<String>, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String, nil]
    WebhookEndpointInput = Struct.new(:events, :name, :url, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] object
    #   @return [String]
    WebhookEndpointListResponse = Struct.new(:data, :object, keyword_init: true)
    # @!attribute [rw] createdAt
    #   @return [String, nil]
    # @!attribute [rw] createdBy
    #   @return [String, nil]
    # @!attribute [rw] deletedAt
    #   @return [String, nil]
    # @!attribute [rw] events
    #   @return [Array<String>]
    # @!attribute [rw] hasSecret
    #   @return [Boolean]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] signing_secret
    #   @return [String]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] updatedAt
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String]
    # @!attribute [rw] workspaceId
    #   @return [String]
    WebhookEndpointSecretResponse = Struct.new(:createdAt, :createdBy, :deletedAt, :events, :hasSecret, :id, :name, :signing_secret, :status, :updatedAt, :url, :workspaceId, keyword_init: true)
    # @!attribute [rw] events
    #   @return [Array<String>, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String, nil]
    WebhookEndpointUpdateRequest = Struct.new(:events, :name, :status, :url, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] slug
    #   @return [String, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    Workspace = Struct.new(:created_at, :created_by, :id, :name, :slug, :updated_at, keyword_init: true)
    # @!attribute [rw] cost_cents
    #   @return [Float]
    # @!attribute [rw] endpoint
    #   @return [String, nil]
    # @!attribute [rw] latency_ms
    #   @return [Integer, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] provider
    #   @return [String, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] timestamp
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    WorkspaceActivityEntry = Struct.new(:cost_cents, :endpoint, :latency_ms, :model, :provider, :request_id, :timestamp, :usage, keyword_init: true)
    # @!attribute [rw] activity
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] limit
    #   @return [Integer]
    # @!attribute [rw] offset
    #   @return [Integer]
    # @!attribute [rw] ok
    #   @return [String]
    # @!attribute [rw] period_days
    #   @return [Integer]
    # @!attribute [rw] total
    #   @return [Integer]
    # @!attribute [rw] total_cost_cents
    #   @return [Float]
    WorkspaceActivityResponse = Struct.new(:activity, :limit, :offset, :ok, :period_days, :total, :total_cost_cents, keyword_init: true)
    # @!attribute [rw] app_key
    #   @return [String]
    # @!attribute [rw] category
    #   @return [String, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] docs_url
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] image_url
    #   @return [String, nil]
    # @!attribute [rw] is_active
    #   @return [Boolean]
    # @!attribute [rw] is_managed
    #   @return [Boolean]
    # @!attribute [rw] is_public
    #   @return [Boolean]
    # @!attribute [rw] last_seen
    #   @return [String, nil]
    # @!attribute [rw] title
    #   @return [String]
    # @!attribute [rw] url
    #   @return [String, nil]
    WorkspaceApp = Struct.new(:app_key, :category, :created_at, :docs_url, :id, :image_url, :is_active, :is_managed, :is_public, :last_seen, :title, :url, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] limit
    #   @return [Integer]
    # @!attribute [rw] offset
    #   @return [Integer]
    # @!attribute [rw] total_count
    #   @return [Integer]
    WorkspaceAppListResponse = Struct.new(:data, :limit, :offset, :total_count, keyword_init: true)
    # @!attribute [rw] target_app_id
    #   @return [String]
    WorkspaceAppMergeRequest = Struct.new(:target_app_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceAppMergeResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceAppResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] category
    #   @return [String, nil]
    # @!attribute [rw] docs_url
    #   @return [String, nil]
    # @!attribute [rw] image_url
    #   @return [String, nil]
    # @!attribute [rw] is_active
    #   @return [Boolean, nil]
    # @!attribute [rw] is_public
    #   @return [Boolean, nil]
    # @!attribute [rw] title
    #   @return [String, nil]
    # @!attribute [rw] url
    #   @return [String, nil]
    WorkspaceAppUpdateRequest = Struct.new(:category, :docs_url, :image_url, :is_active, :is_public, :title, :url, keyword_init: true)
    WorkspaceAssignableRole = Object
    # @!attribute [rw] action
    #   @return [String]
    # @!attribute [rw] actor
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] actor_user_id
    #   @return [String, nil]
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] target_id
    #   @return [String]
    # @!attribute [rw] target_name
    #   @return [String, nil]
    # @!attribute [rw] target_type
    #   @return [String]
    # @!attribute [rw] workspace_id
    #   @return [String]
    WorkspaceAuditEvent = Struct.new(:action, :actor, :actor_user_id, :created_at, :id, :metadata, :request_id, :target_id, :target_name, :target_type, :workspace_id, keyword_init: true)
    # @!attribute [rw] display_name
    #   @return [String, nil]
    # @!attribute [rw] email
    #   @return [String, nil]
    WorkspaceAuditEventActor = Struct.new(:display_name, :email, keyword_init: true)
    # @!attribute [rw] dailyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] dailyRequests
    #   @return [Integer, nil]
    # @!attribute [rw] monthlyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] monthlyRequests
    #   @return [Integer, nil]
    # @!attribute [rw] softBlocked
    #   @return [Boolean, nil]
    # @!attribute [rw] weeklyCostNanos
    #   @return [Integer, nil]
    # @!attribute [rw] weeklyRequests
    #   @return [Integer, nil]
    WorkspaceAuditEventLimits = Struct.new(:dailyCostNanos, :dailyRequests, :monthlyCostNanos, :monthlyRequests, :softBlocked, :weeklyCostNanos, :weeklyRequests, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] has_more
    #   @return [Boolean]
    # @!attribute [rw] next_cursor
    #   @return [String, nil]
    WorkspaceAuditEventListResponse = Struct.new(:data, :has_more, :next_cursor, keyword_init: true)
    # @!attribute [rw] accessTemplate
    #   @return [String, nil]
    # @!attribute [rw] changedFields
    #   @return [Array<String>, nil]
    # @!attribute [rw] expiresAt
    #   @return [String, nil]
    # @!attribute [rw] limits
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] prefix
    #   @return [String, nil]
    # @!attribute [rw] previousKeyExpiresAt
    #   @return [String, nil]
    # @!attribute [rw] replacementKeyId
    #   @return [String, nil]
    # @!attribute [rw] replacementKeyName
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    WorkspaceAuditEventMetadata = Struct.new(:accessTemplate, :changedFields, :expiresAt, :limits, :prefix, :previousKeyExpiresAt, :replacementKeyId, :replacementKeyName, :status, keyword_init: true)
    # @!attribute [rw] amount_nanos
    #   @return [Integer]
    # @!attribute [rw] balance_threshold_nanos
    #   @return [Integer]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] payment_method_id
    #   @return [String, nil]
    WorkspaceAutoTopUpSettings = Struct.new(:amount_nanos, :balance_threshold_nanos, :enabled, :payment_method_id, keyword_init: true)
    # @!attribute [rw] amount_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] balance_threshold_nanos
    #   @return [Integer, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] payment_method_id
    #   @return [String, nil]
    WorkspaceAutoTopUpUpdate = Struct.new(:amount_nanos, :balance_threshold_nanos, :enabled, :payment_method_id, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String]
    # @!attribute [rw] created_by
    #   @return [String, nil]
    # @!attribute [rw] exceeded
    #   @return [Boolean]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] interval
    #   @return [String]
    # @!attribute [rw] limit
    #   @return [Float]
    # @!attribute [rw] limit_nanos
    #   @return [Integer]
    # @!attribute [rw] remaining
    #   @return [Float]
    # @!attribute [rw] remaining_nanos
    #   @return [Integer]
    # @!attribute [rw] reset_at
    #   @return [String, nil]
    # @!attribute [rw] updated_at
    #   @return [String]
    # @!attribute [rw] usage
    #   @return [Float]
    # @!attribute [rw] usage_nanos
    #   @return [Integer]
    # @!attribute [rw] window_start
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    WorkspaceBudget = Struct.new(:created_at, :created_by, :exceeded, :id, :interval, :limit, :limit_nanos, :remaining, :remaining_nanos, :reset_at, :updated_at, :usage, :usage_nanos, :window_start, :workspace_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceBudgetDeleteResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] interval
    #   @return [String]
    # @!attribute [rw] limit
    #   @return [Float]
    WorkspaceBudgetInput = Struct.new(:interval, :limit, keyword_init: true)
    WorkspaceBudgetInterval = Object
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    WorkspaceBudgetListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceBudgetResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] interval
    #   @return [String, nil]
    # @!attribute [rw] limit
    #   @return [Float, nil]
    WorkspaceBudgetUpdateInput = Struct.new(:interval, :limit, keyword_init: true)
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] slug
    #   @return [String, nil]
    WorkspaceCreateRequest = Struct.new(:name, :slug, keyword_init: true)
    # @!attribute [rw] color
    #   @return [String, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] directory_name
    #   @return [String, nil]
    # @!attribute [rw] icon
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] name_overridden
    #   @return [Boolean, nil]
    # @!attribute [rw] source_id
    #   @return [String, nil]
    # @!attribute [rw] source_type
    #   @return [String, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    WorkspaceDepartment = Struct.new(:color, :created_at, :description, :directory_name, :icon, :id, :name, :name_overridden, :source_id, :source_type, :updated_at, keyword_init: true)
    # @!attribute [rw] color
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] icon
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String]
    WorkspaceDepartmentCreateRequest = Struct.new(:color, :description, :icon, :name, keyword_init: true)
    # @!attribute [rw] color
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] icon
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    WorkspaceDepartmentInput = Struct.new(:color, :description, :icon, :name, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    WorkspaceDepartmentListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] department_id
    #   @return [String]
    # @!attribute [rw] is_primary
    #   @return [Boolean]
    # @!attribute [rw] position
    #   @return [String]
    # @!attribute [rw] user_id
    #   @return [String]
    WorkspaceDepartmentMember = Struct.new(:department_id, :is_primary, :position, :user_id, keyword_init: true)
    # @!attribute [rw] position
    #   @return [String, nil]
    # @!attribute [rw] primary
    #   @return [Boolean, nil]
    WorkspaceDepartmentMemberRequest = Struct.new(:position, :primary, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceDepartmentMemberResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceDepartmentResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] color
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] icon
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    WorkspaceDepartmentUpdateRequest = Struct.new(:color, :description, :icon, :name, keyword_init: true)
    # @!attribute [rw] access_source
    #   @return [String]
    # @!attribute [rw] department
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] department_override_enabled
    #   @return [Boolean]
    # @!attribute [rw] department_override_id
    #   @return [String, nil]
    # @!attribute [rw] department_source
    #   @return [String]
    # @!attribute [rw] directory_department
    #   @return [String, nil]
    # @!attribute [rw] display_name
    #   @return [String]
    # @!attribute [rw] effective_role
    #   @return [String]
    # @!attribute [rw] email
    #   @return [String, nil]
    # @!attribute [rw] joined_at
    #   @return [String, nil]
    # @!attribute [rw] role_override
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] user_id
    #   @return [String]
    # @!attribute [rw] workspace_role
    #   @return [String]
    WorkspaceDirectoryMember = Struct.new(:access_source, :department, :department_override_enabled, :department_override_id, :department_source, :directory_department, :display_name, :effective_role, :email, :joined_at, :role_override, :status, :user_id, :workspace_role, keyword_init: true)
    # @!attribute [rw] access_role
    #   @return [String, nil]
    # @!attribute [rw] department_id
    #   @return [String, nil]
    # @!attribute [rw] department_mode
    #   @return [String, nil]
    # @!attribute [rw] department_position
    #   @return [String, nil]
    WorkspaceDirectoryMemberUpdateRequest = Struct.new(:access_role, :department_id, :department_mode, :department_position, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceDirectoryResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] access_role
    #   @return [String]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] department_id
    #   @return [String]
    # @!attribute [rw] department_position
    #   @return [String]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] scim_group_id
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    WorkspaceGroupMapping = Struct.new(:access_role, :created_at, :department_id, :department_position, :id, :scim_group_id, :updated_at, keyword_init: true)
    # @!attribute [rw] access_role
    #   @return [String, nil]
    # @!attribute [rw] department_id
    #   @return [String]
    # @!attribute [rw] department_position
    #   @return [String, nil]
    # @!attribute [rw] scim_group_id
    #   @return [String]
    WorkspaceGroupMappingCreateRequest = Struct.new(:access_role, :department_id, :department_position, :scim_group_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    WorkspaceGroupMappingListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceGroupMappingResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] access_role
    #   @return [String, nil]
    # @!attribute [rw] department_position
    #   @return [String, nil]
    WorkspaceGroupMappingUpdateRequest = Struct.new(:access_role, :department_position, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] creator_user_id
    #   @return [String]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] max_uses
    #   @return [Integer, nil]
    # @!attribute [rw] role
    #   @return [String]
    # @!attribute [rw] token_preview
    #   @return [String, nil]
    # @!attribute [rw] uses_count
    #   @return [Integer, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    WorkspaceInvite = Struct.new(:created_at, :creator_user_id, :expires_at, :id, :max_uses, :role, :token_preview, :uses_count, :workspace_id, keyword_init: true)
    # @!attribute [rw] expires_in_days
    #   @return [Integer, nil]
    # @!attribute [rw] max_uses
    #   @return [Integer, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    WorkspaceInviteCreateRequest = Struct.new(:expires_in_days, :max_uses, :role, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    # @!attribute [rw] token
    #   @return [String]
    WorkspaceInviteCreateResponse = Struct.new(:data, :token, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    WorkspaceInviteListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] decided_at
    #   @return [String, nil]
    # @!attribute [rw] decided_by
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] invite_id
    #   @return [String, nil]
    # @!attribute [rw] requester_user_id
    #   @return [String]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] workspace_id
    #   @return [String]
    WorkspaceJoinRequest = Struct.new(:created_at, :decided_at, :decided_by, :id, :invite_id, :requester_user_id, :status, :workspace_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    WorkspaceJoinRequestListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceJoinRequestResponse = Struct.new(:data, keyword_init: true)
    WorkspaceJoinRequestStatus = Object
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    WorkspaceListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] threshold_usd
    #   @return [Float]
    WorkspaceLowBalanceEmailSettings = Struct.new(:enabled, :threshold_usd, keyword_init: true)
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] threshold_usd
    #   @return [Float, nil]
    WorkspaceLowBalanceEmailUpdate = Struct.new(:enabled, :threshold_usd, keyword_init: true)
    # @!attribute [rw] display_name
    #   @return [String, nil]
    # @!attribute [rw] joined_at
    #   @return [String, nil]
    # @!attribute [rw] role
    #   @return [String]
    # @!attribute [rw] user_id
    #   @return [String]
    # @!attribute [rw] workspace_id
    #   @return [String]
    WorkspaceMember = Struct.new(:display_name, :joined_at, :role, :user_id, :workspace_id, keyword_init: true)
    # @!attribute [rw] added_count
    #   @return [Integer]
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    WorkspaceMemberAddResponse = Struct.new(:added_count, :data, keyword_init: true)
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] user_ids
    #   @return [Array<String>]
    WorkspaceMemberBulkRequest = Struct.new(:role, :user_ids, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] total_count
    #   @return [Integer]
    WorkspaceMemberListResponse = Struct.new(:data, :total_count, keyword_init: true)
    # @!attribute [rw] user_ids
    #   @return [Array<String>]
    WorkspaceMemberRemoveRequest = Struct.new(:user_ids, keyword_init: true)
    # @!attribute [rw] removed_count
    #   @return [Integer]
    WorkspaceMemberRemoveResponse = Struct.new(:removed_count, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceMemberResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] role
    #   @return [String]
    WorkspaceMemberRoleUpdateRequest = Struct.new(:role, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] status
    #   @return [String]
    # @!attribute [rw] target_preview
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    WorkspaceNotificationDestination = Struct.new(:created_at, :id, :name, :status, :target_preview, :type, :updated_at, keyword_init: true)
    # @!attribute [rw] name
    #   @return [String]
    # @!attribute [rw] target
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    WorkspaceNotificationDestinationCreateRequest = Struct.new(:name, :target, :type, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    WorkspaceNotificationDestinationListResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceNotificationDestinationResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] target
    #   @return [String]
    # @!attribute [rw] type
    #   @return [String]
    WorkspaceNotificationDestinationTestRequest = Struct.new(:target, :type, keyword_init: true)
    WorkspaceNotificationDestinationType = Object
    # @!attribute [rw] auto_top_up_failure
    #   @return [Boolean]
    # @!attribute [rw] model_deprecation
    #   @return [Boolean]
    # @!attribute [rw] payment_method_expiring
    #   @return [Boolean]
    WorkspaceNotificationEmailPreferences = Struct.new(:auto_top_up_failure, :model_deprecation, :payment_method_expiring, keyword_init: true)
    # @!attribute [rw] auto_top_up_failure
    #   @return [Boolean, nil]
    # @!attribute [rw] model_deprecation
    #   @return [Boolean, nil]
    # @!attribute [rw] payment_method_expiring
    #   @return [Boolean, nil]
    WorkspaceNotificationEmailPreferencesUpdate = Struct.new(:auto_top_up_failure, :model_deprecation, :payment_method_expiring, keyword_init: true)
    WorkspaceNotificationEventKind = Object
    # @!attribute [rw] destination_ids
    #   @return [Array<String>]
    # @!attribute [rw] event_kind
    #   @return [String]
    WorkspaceNotificationRoute = Struct.new(:destination_ids, :event_kind, keyword_init: true)
    # @!attribute [rw] auto_top_up_failed
    #   @return [Array<String>]
    # @!attribute [rw] low_balance
    #   @return [Array<String>]
    # @!attribute [rw] model_deprecation
    #   @return [Array<String>]
    # @!attribute [rw] payment_method_expiring
    #   @return [Array<String>]
    WorkspaceNotificationRouteMap = Struct.new(:auto_top_up_failed, :low_balance, :model_deprecation, :payment_method_expiring, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceNotificationRouteResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceNotificationRoutesResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] destination_ids
    #   @return [Array<String>]
    WorkspaceNotificationRouteUpdateRequest = Struct.new(:destination_ids, keyword_init: true)
    # @!attribute [rw] auto_top_up
    #   @return [Hash{String => Object}]
    # @!attribute [rw] email_preferences
    #   @return [Hash{String => Object}]
    # @!attribute [rw] low_balance_email
    #   @return [Hash{String => Object}]
    WorkspaceNotificationSettings = Struct.new(:auto_top_up, :email_preferences, :low_balance_email, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceNotificationSettingsResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] auto_top_up
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] email_preferences
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] low_balance_email
    #   @return [Hash{String => Object}, nil]
    WorkspaceNotificationSettingsUpdateRequest = Struct.new(:auto_top_up, :email_preferences, :low_balance_email, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceNotificationTestResponse = Struct.new(:data, keyword_init: true)
    WorkspaceProviderRestrictionMode = Object
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceResponse = Struct.new(:data, keyword_init: true)
    WorkspaceRole = Object
    WorkspaceRoutingMode = Object
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>]
    WorkspaceScimAuditResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    WorkspaceScimEndpoint = Struct.new(:created_at, :enabled, :id, :updated_at, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceScimEndpointResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] action
    #   @return [String, nil]
    # @!attribute [rw] correlation_id
    #   @return [String, nil]
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] detail
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] http_status
    #   @return [Integer, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] outcome
    #   @return [String, nil]
    # @!attribute [rw] request_id
    #   @return [String, nil]
    # @!attribute [rw] resource_id
    #   @return [String, nil]
    # @!attribute [rw] resource_type
    #   @return [String, nil]
    # @!attribute [rw] scim_type
    #   @return [String, nil]
    WorkspaceScimEvent = Struct.new(:action, :correlation_id, :created_at, :detail, :http_status, :id, :outcome, :request_id, :resource_id, :resource_type, :scim_type, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceScimResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] created_at
    #   @return [String, nil]
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] id
    #   @return [String]
    # @!attribute [rw] label
    #   @return [String]
    # @!attribute [rw] last_used_at
    #   @return [String, nil]
    # @!attribute [rw] revoked_at
    #   @return [String, nil]
    # @!attribute [rw] token_prefix
    #   @return [String]
    WorkspaceScimToken = Struct.new(:created_at, :expires_at, :id, :label, :last_used_at, :revoked_at, :token_prefix, keyword_init: true)
    # @!attribute [rw] expires_at
    #   @return [String, nil]
    # @!attribute [rw] label
    #   @return [String, nil]
    WorkspaceScimTokenCreateRequest = Struct.new(:expires_at, :label, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceScimTokenCreateResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] enabled
    #   @return [Boolean]
    WorkspaceScimUpdateRequest = Struct.new(:enabled, keyword_init: true)
    # @!attribute [rw] alpha_channel_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] beta_channel_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] byok_fallback_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] io_logging_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] io_logging_include_provider_payloads
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_free_may_publish_prompts
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_free_may_train
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_input_output_logging
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_paid_may_train
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_zdr_only
    #   @return [Boolean, nil]
    # @!attribute [rw] provider_restriction_enforce_allowed
    #   @return [Boolean, nil]
    # @!attribute [rw] provider_restriction_mode
    #   @return [Object, nil]
    # @!attribute [rw] provider_restriction_provider_ids
    #   @return [Array<String>, nil]
    # @!attribute [rw] response_healing_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] response_healing_locked
    #   @return [Boolean, nil]
    # @!attribute [rw] response_healing_mode
    #   @return [String, nil]
    # @!attribute [rw] routing_mode
    #   @return [Object, nil]
    # @!attribute [rw] updated_at
    #   @return [String, nil]
    # @!attribute [rw] workspace_id
    #   @return [String]
    WorkspaceSettings = Struct.new(:alpha_channel_enabled, :beta_channel_enabled, :byok_fallback_enabled, :io_logging_enabled, :io_logging_include_provider_payloads, :privacy_enable_free_may_publish_prompts, :privacy_enable_free_may_train, :privacy_enable_input_output_logging, :privacy_enable_paid_may_train, :privacy_zdr_only, :provider_restriction_enforce_allowed, :provider_restriction_mode, :provider_restriction_provider_ids, :response_healing_enabled, :response_healing_locked, :response_healing_mode, :routing_mode, :updated_at, :workspace_id, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceSettingsResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] alpha_channel_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] beta_channel_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] byok_fallback_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] io_logging_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] io_logging_include_provider_payloads
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_free_may_publish_prompts
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_free_may_train
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_input_output_logging
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_enable_paid_may_train
    #   @return [Boolean, nil]
    # @!attribute [rw] privacy_zdr_only
    #   @return [Boolean, nil]
    # @!attribute [rw] provider_restriction_enforce_allowed
    #   @return [Boolean, nil]
    # @!attribute [rw] provider_restriction_mode
    #   @return [String, nil]
    # @!attribute [rw] provider_restriction_provider_ids
    #   @return [Array<String>, nil]
    # @!attribute [rw] response_healing_enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] response_healing_locked
    #   @return [Boolean, nil]
    # @!attribute [rw] response_healing_mode
    #   @return [String, nil]
    # @!attribute [rw] routing_mode
    #   @return [String, nil]
    WorkspaceSettingsUpdateRequest = Struct.new(:alpha_channel_enabled, :beta_channel_enabled, :byok_fallback_enabled, :io_logging_enabled, :io_logging_include_provider_payloads, :privacy_enable_free_may_publish_prompts, :privacy_enable_free_may_train, :privacy_enable_input_output_logging, :privacy_enable_paid_may_train, :privacy_zdr_only, :provider_restriction_enforce_allowed, :provider_restriction_mode, :provider_restriction_provider_ids, :response_healing_enabled, :response_healing_locked, :response_healing_mode, :routing_mode, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Hash{String => Object}]
    WorkspaceSsoResponse = Struct.new(:data, keyword_init: true)
    # @!attribute [rw] domains
    #   @return [Array<String>]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] enforced
    #   @return [String]
    # @!attribute [rw] mode
    #   @return [String]
    # @!attribute [rw] provider_identifier
    #   @return [String, nil]
    WorkspaceSsoSettings = Struct.new(:domains, :enabled, :enforced, :mode, :provider_identifier, keyword_init: true)
    # @!attribute [rw] domains
    #   @return [Array<String>, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean]
    # @!attribute [rw] enforced
    #   @return [String, nil]
    # @!attribute [rw] mode
    #   @return [String]
    # @!attribute [rw] provider_identifier
    #   @return [String, nil]
    WorkspaceSsoUpdateRequest = Struct.new(:domains, :enabled, :enforced, :mode, :provider_identifier, keyword_init: true)
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] slug
    #   @return [String, nil]
    WorkspaceUpdateRequest = Struct.new(:name, :slug, keyword_init: true)
  end
end
