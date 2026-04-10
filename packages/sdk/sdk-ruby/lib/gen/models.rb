module AiStats
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
    AnthropicMessagesRequest = Struct.new(:debug, :echo_upstream_request, :max_tokens, :messages, :meta, :metadata, :model, :provider, :provider_options, :reasoning, :stop_sequences, :stream, :system, :temperature, :tool_choice, :tools, :top_k, :top_p, :usage, keyword_init: true)
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
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] input_schema
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] name
    #   @return [String]
    AnthropicTool = Struct.new(:description, :input_schema, :name, keyword_init: true)
    # @!attribute [rw] input_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] output_tokens
    #   @return [Integer, nil]
    AnthropicUsage = Struct.new(:input_tokens, :output_tokens, keyword_init: true)
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
    # @!attribute [rw] language
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    AudioTranscriptionRequest = Struct.new(:audio_b64, :audio_url, :language, :model, :provider, keyword_init: true)
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
    # @!attribute [rw] completion_window
    #   @return [String, nil]
    # @!attribute [rw] debug
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] endpoint
    #   @return [String]
    # @!attribute [rw] input_file_id
    #   @return [String]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider
    #   @return [Hash{String => Object}, nil]
    BatchRequest = Struct.new(:completion_window, :debug, :endpoint, :input_file_id, :metadata, :provider, keyword_init: true)
    # @!attribute [rw] completed
    #   @return [Integer, nil]
    # @!attribute [rw] failed
    #   @return [Integer, nil]
    # @!attribute [rw] total
    #   @return [Integer, nil]
    BatchRequestCounts = Struct.new(:completed, :failed, :total, keyword_init: true)
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
    # @!attribute [rw] finalizing_at
    #   @return [Integer, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] in_progress_at
    #   @return [Integer, nil]
    # @!attribute [rw] input_file_id
    #   @return [String, nil]
    # @!attribute [rw] metadata
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] output_file_id
    #   @return [String, nil]
    # @!attribute [rw] request_counts
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    BatchResponse = Struct.new(:cancelled_at, :cancelling_at, :completed_at, :completion_window, :created_at, :endpoint, :error_file_id, :errors, :expired_at, :expires_at, :failed_at, :finalizing_at, :id, :in_progress_at, :input_file_id, :metadata, :object, :output_file_id, :request_counts, :status, keyword_init: true)
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
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] provider_options
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] reasoning
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] response_format
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] safety_identifier
    #   @return [String, nil]
    # @!attribute [rw] seed
    #   @return [Integer, nil]
    # @!attribute [rw] service_tier
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
    ChatCompletionsRequest = Struct.new(:debug, :echo_upstream_request, :frequency_penalty, :image_config, :logit_bias, :logprobs, :max_completion_tokens, :max_tokens, :max_tool_calls, :messages, :meta, :metadata, :modalities, :model, :parallel_tool_calls, :presence_penalty, :prompt_cache_key, :provider, :provider_options, :reasoning, :response_format, :safety_identifier, :seed, :service_tier, :stop, :store, :stream, :stream_options, :temperature, :tool_choice, :tools, :top_logprobs, :top_p, :usage, :user, :user_id, keyword_init: true)
    # @!attribute [rw] choices
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] created
    #   @return [Integer, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    ChatCompletionsResponse = Struct.new(:choices, :created, :id, :model, :object, :usage, keyword_init: true)
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
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] error
    #   @return [String, Hash{String => Object}]
    # @!attribute [rw] message
    #   @return [String, nil]
    # @!attribute [rw] ok
    #   @return [Boolean, nil]
    ErrorResponse = Struct.new(:description, :error, :message, :ok, keyword_init: true)
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
    # @!attribute [rw] function
    #   @return [Hash{String => Object}]
    # @!attribute [rw] type
    #   @return [String]
    FunctionToolDefinition = Struct.new(:function, :type, keyword_init: true)
    # @!attribute [rw] parameters
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] timezone
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String]
    GatewayDatetimeToolDefinition = Struct.new(:parameters, :timezone, :type, keyword_init: true)
    # @!attribute [rw] limit
    #   @return [Integer]
    # @!attribute [rw] models
    #   @return [Array<Hash{String => Object}>]
    # @!attribute [rw] offset
    #   @return [Integer]
    # @!attribute [rw] ok
    #   @return [Boolean]
    # @!attribute [rw] privacy_scope
    #   @return [String]
    # @!attribute [rw] total
    #   @return [Integer]
    GatewayModelsResponse = Struct.new(:limit, :models, :offset, :ok, :privacy_scope, :total, keyword_init: true)
    # @!attribute [rw] app_id
    #   @return [String, nil]
    # @!attribute [rw] byok
    #   @return [Boolean, nil]
    # @!attribute [rw] cost_nanos
    #   @return [Float, nil]
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
    GenerationResponse = Struct.new(:app_id, :byok, :cost_nanos, :currency, :endpoint, :error_code, :error_message, :generation_ms, :key_id, :latency_ms, :model_id, :native_response_id, :pricing_lines, :provider, :request_id, :status_code, :stream, :success, :team_id, :throughput, :usage, keyword_init: true)
    # @!attribute [rw] status
    #   @return [String]
    HealthCheckResponse = Struct.new(:status, keyword_init: true)
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
    # @!attribute [rw] size
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Boolean, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    ImagesEditRequest = Struct.new(:image, :mask, :meta, :model, :n, :prompt, :provider, :size, :usage, :user, keyword_init: true)
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
    # @!attribute [rw] response_format
    #   @return [String, nil]
    # @!attribute [rw] size
    #   @return [String, nil]
    # @!attribute [rw] style
    #   @return [String, nil]
    # @!attribute [rw] user
    #   @return [String, nil]
    ImagesGenerationRequest = Struct.new(:model, :n, :prompt, :provider, :quality, :response_format, :size, :style, :user, keyword_init: true)
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
    # @!attribute [rw] cache_version
    #   @return [Hash{String => Object}]
    # @!attribute [rw] key
    #   @return [Hash{String => Object}]
    # @!attribute [rw] message
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    KeyInvalidateResponse = Struct.new(:cache_version, :key, :message, :ok, keyword_init: true)
    # @!attribute [rw] data
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    ListFilesResponse = Struct.new(:data, :object, keyword_init: true)
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
    #   @return [Array<String>, nil]
    # @!attribute [rw] architecture
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] canonical_slug
    #   @return [String, nil]
    # @!attribute [rw] created
    #   @return [Integer, nil]
    # @!attribute [rw] deprecation_date
    #   @return [String, nil]
    # @!attribute [rw] description
    #   @return [String, nil]
    # @!attribute [rw] endpoints
    #   @return [Array<String>, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] input_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] lifecycle
    #   @return [ModelLifecycle, nil]
    # @!attribute [rw] model_id
    #   @return [String, nil]
    # @!attribute [rw] name
    #   @return [String, nil]
    # @!attribute [rw] organisation_colour
    #   @return [String, nil]
    # @!attribute [rw] organisation_id
    #   @return [String, nil]
    # @!attribute [rw] organisation_name
    #   @return [String, nil]
    # @!attribute [rw] output_types
    #   @return [Array<String>, nil]
    # @!attribute [rw] per_request_limits
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] pricing
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] pricing_detail
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] providers
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] release_date
    #   @return [String, nil]
    # @!attribute [rw] retirement_date
    #   @return [String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] supported_parameters
    #   @return [Array<String>, nil]
    # @!attribute [rw] supported_params
    #   @return [Array<String>, nil]
    # @!attribute [rw] top_provider
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] top_provider_id
    #   @return [String, nil]
    Model = Struct.new(:aliases, :architecture, :canonical_slug, :created, :deprecation_date, :description, :endpoints, :id, :input_types, :lifecycle, :model_id, :name, :organisation_colour, :organisation_id, :organisation_name, :output_types, :per_request_limits, :pricing, :pricing_detail, :providers, :release_date, :retirement_date, :status, :supported_parameters, :supported_params, :top_provider, :top_provider_id, keyword_init: true)
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
    # @!attribute [rw] code
    #   @return [String]
    # @!attribute [rw] error
    #   @return [String]
    # @!attribute [rw] message
    #   @return [String]
    # @!attribute [rw] ok
    #   @return [String]
    # @!attribute [rw] privacy_scope
    #   @return [String]
    ModelsPrivacyScopeNotImplementedResponse = Struct.new(:code, :error, :message, :ok, :privacy_scope, keyword_init: true)
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
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] results
    #   @return [Array<Hash{String => Object}>, nil]
    ModerationsResponse = Struct.new(:id, :model, :results, keyword_init: true)
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
    MusicGenerateResponse = Struct.new(:_unused, keyword_init: true)
    # @!attribute [rw] description
    #   @return [String]
    # @!attribute [rw] error
    #   @return [String]
    # @!attribute [rw] status_code
    #   @return [Integer]
    NotImplementedResponse = Struct.new(:description, :error, :status_code, keyword_init: true)
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
    # @!attribute [rw] anthropic
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] google
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] openai
    #   @return [Hash{String => Object}, nil]
    ProviderOptions = Struct.new(:anthropic, :google, :openai, keyword_init: true)
    # @!attribute [rw] ignore
    #   @return [Array<String>, nil]
    # @!attribute [rw] include_alpha
    #   @return [Boolean, nil]
    # @!attribute [rw] only
    #   @return [Array<String>, nil]
    # @!attribute [rw] order
    #   @return [Array<String>, nil]
    ProviderRoutingOptions = Struct.new(:ignore, :include_alpha, :only, :order, keyword_init: true)
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
    # @!attribute [rw] error
    #   @return [Hash{String => Object}]
    RealtimeNotImplementedResponse = Struct.new(:error, keyword_init: true)
    # @!attribute [rw] effort
    #   @return [String, nil]
    # @!attribute [rw] enabled
    #   @return [Boolean, nil]
    # @!attribute [rw] max_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] summary
    #   @return [String, nil]
    ReasoningConfig = Struct.new(:effort, :enabled, :max_tokens, :summary, keyword_init: true)
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
    ResponsesRequest = Struct.new(:background, :debug, :echo_upstream_request, :image_config, :include, :input, :instructions, :max_output_tokens, :meta, :metadata, :modalities, :model, :parallel_tool_calls, :previous_response_id, :prompt_cache_key, :provider, :provider_options, :reasoning, :safety_identifier, :service_tier, :store, :stream, :temperature, :text, :tool_choice, :tools, :top_p, :truncation, :usage, :user, keyword_init: true)
    # @!attribute [rw] content
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] created
    #   @return [Integer, nil]
    # @!attribute [rw] id
    #   @return [String, nil]
    # @!attribute [rw] model
    #   @return [String, nil]
    # @!attribute [rw] object
    #   @return [String, nil]
    # @!attribute [rw] output
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] output_items
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] stop_reason
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    ResponsesResponse = Struct.new(:content, :created, :id, :model, :object, :output, :output_items, :role, :stop_reason, :type, :usage, keyword_init: true)
    # @!attribute [rw] input
    #   @return [String, Array<Hash{String => Object}>, Hash{String => Object}, nil]
    # @!attribute [rw] model
    #   @return [String]
    # @!attribute [rw] previous_response_id
    #   @return [String, nil]
    # @!attribute [rw] store
    #   @return [Boolean, nil]
    # @!attribute [rw] tool_choice
    #   @return [String, Hash{String => Object}, nil]
    # @!attribute [rw] tools
    #   @return [Array<Hash{String => Object}>, nil]
    # @!attribute [rw] type
    #   @return [String]
    ResponsesWebSocketCreateEvent = Struct.new(:input, :model, :previous_response_id, :store, :tool_choice, :tools, :type, keyword_init: true)
    # @!attribute [rw] error
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] response
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] status
    #   @return [Integer, nil]
    # @!attribute [rw] type
    #   @return [String, nil]
    ResponsesWebSocketServerEvent = Struct.new(:error, :response, :status, :type, keyword_init: true)
    # @!attribute [rw] error
    #   @return [Hash{String => Object}, nil]
    ResponsesWebSocketUpgradeRequiredResponse = Struct.new(:error, keyword_init: true)
    # @!attribute [rw] datetime_requests
    #   @return [Integer, nil]
    ServerToolUsage = Struct.new(:datetime_requests, keyword_init: true)
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
    # @!attribute [rw] completion_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] prompt_tokens
    #   @return [Integer, nil]
    # @!attribute [rw] server_tool_use
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] total_tokens
    #   @return [Integer, nil]
    Usage = Struct.new(:completion_tokens, :prompt_tokens, :server_tool_use, :total_tokens, keyword_init: true)
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
    # @!attribute [rw] generate_audio
    #   @return [Boolean, nil]
    # @!attribute [rw] input_references
    #   @return [Array<Hash{String => Object}>, nil]
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
    VideoGenerationRequest = Struct.new(:aspect_ratio, :compression_quality, :duration, :enhance_prompt, :generate_audio, :input_references, :model, :negative_prompt, :output, :person_generation, :prompt, :provider, :provider_params, :resize_mode, :resolution, :sample_count, :seed, :size, :webhook, keyword_init: true)
    # @!attribute [rw] asset
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] audio
    #   @return [Boolean, nil]
    # @!attribute [rw] billing
    #   @return [Hash{String => Object}, nil]
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
    # @!attribute [rw] model
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
    # @!attribute [rw] seconds
    #   @return [Float, nil]
    # @!attribute [rw] size
    #   @return [String, nil]
    # @!attribute [rw] started_at
    #   @return [Integer, String, nil]
    # @!attribute [rw] status
    #   @return [String, nil]
    # @!attribute [rw] usage
    #   @return [Hash{String => Object}, nil]
    VideoGenerationResponse = Struct.new(:asset, :audio, :billing, :completed_at, :content_url, :created_at, :download_url, :error, :expires_at, :generation_id, :id, :model, :object, :output_access, :outputs, :poll_after_seconds, :polling_url, :progress, :progress_source, :provider, :seconds, :size, :started_at, :status, :usage, keyword_init: true)
    # @!attribute [rw] image_url
    #   @return [Hash{String => Object}, nil]
    # @!attribute [rw] reference_type
    #   @return [String, nil]
    # @!attribute [rw] role
    #   @return [String, nil]
    # @!attribute [rw] type
    #   @return [String]
    VideoInputReference = Struct.new(:image_url, :reference_type, :role, :type, keyword_init: true)
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
  end
end
