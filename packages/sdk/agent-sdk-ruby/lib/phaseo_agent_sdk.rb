require "json"
require "securerandom"
begin
  require "phaseo_sdk"
rescue LoadError
  begin
    require "phaseo_sdk"
  rescue LoadError
    require_relative "../../sdk-ruby/lib/index"
  end
end

module PhaseoAgentSdk
  ToolCall = Struct.new(:id, :name, :input, keyword_init: true)
  Message = Struct.new(:role, :content, :tool_calls, :tool_call_id, :name, keyword_init: true)
  Tool = Struct.new(:id, :execute, :description, :parameters, keyword_init: true)
  RuntimeContext = Struct.new(:run_id, :agent_id, :step_index, :context, keyword_init: true)
  ModelRequest = Struct.new(:agent_id, :messages, :tools, :model, :instructions, :context, keyword_init: true)
  ModelResponse = Struct.new(:message, :usage, :request_id, :provider, :model, :response_meta, keyword_init: true)
  AgentDefinition = Struct.new(:id, :model, :preset, :instructions, :tools, :max_steps, :parse_output, keyword_init: true)
  RunStep = Struct.new(:index, :tool_calls, :request_id, :provider, :model, keyword_init: true)
  RunRecord = Struct.new(:id, :agent_id, :status, :input, :messages, :step_count, :result, :error, keyword_init: true)
  RunResult = Struct.new(:run, :steps, :output, :messages, keyword_init: true)

  def self.define_tool(tool)
    tool
  end

  def self.create_agent(definition)
    Agent.new(definition.is_a?(AgentDefinition) ? definition : AgentDefinition.new(**definition))
  end

  def self.create_gateway_agent_client(**options)
    GatewayAgentClient.new(**options)
  end

  class GatewayAgentClient
    def initialize(client: nil, api_key: nil, base_url: nil, model: nil, preset: nil, provider: nil, reasoning: nil,
                   temperature: nil, max_output_tokens: nil, parallel_tool_calls: nil, metadata: nil, user: nil,
                   response_format: nil, include_meta: nil, web_search_options: nil, plugins: nil, gateway_tools: nil,
                   tool_choice: nil, provider_options: nil, prompt_cache_key: nil)
      api_key ||= ENV["PHASEO_API_KEY"]
      @client = client || PhaseoSdk::Phaseo.new(
        api_key: api_key,
        base_path: base_url || "https://api.phaseo.ai/v1"
      )
      @model = model
      @preset = preset
      @provider = provider
      @reasoning = reasoning
      @temperature = temperature
      @max_output_tokens = max_output_tokens
      @parallel_tool_calls = parallel_tool_calls
      @metadata = metadata
      @user = user
      @response_format = response_format
      @include_meta = include_meta
      @web_search_options = web_search_options
      @plugins = plugins
      @gateway_tools = gateway_tools || []
      @tool_choice = tool_choice
      @provider_options = provider_options
      @prompt_cache_key = prompt_cache_key
    end

    def generate(request)
      payload = {
        model: request.model || @model || preset_alias(@preset) || "phaseo/free",
        input: to_responses_input(request.messages),
        instructions: to_instructions(request.messages, request.instructions),
        tools: request.tools.map do |tool|
          {
            type: "function",
            function: {
              name: tool.id,
              description: tool.description,
              parameters: tool.parameters || { type: "object", additionalProperties: true }
            }
          }
        end + @gateway_tools,
        tool_choice: @tool_choice,
        parallel_tool_calls: @parallel_tool_calls,
        temperature: @temperature,
        max_output_tokens: @max_output_tokens,
        provider: @provider,
        reasoning: @reasoning,
        metadata: @metadata,
        meta: @include_meta,
        user: @user,
        response_format: @response_format,
        web_search_options: @web_search_options,
        plugins: @plugins,
        provider_options: @provider_options,
        prompt_cache_key: @prompt_cache_key
      }.compact

      response = @client.create_response(payload)
      ModelResponse.new(
        message: Message.new(
          role: "assistant",
          content: extract_assistant_text(response),
          tool_calls: extract_tool_calls(response)
        ),
        usage: response["usage"],
        request_id: response["id"],
        provider: response["provider"],
        model: response["model"],
        response_meta: response["meta"].is_a?(Hash) ? response["meta"] : nil
      )
    end

    private

    def preset_alias(value)
      return nil unless value.is_a?(String)
      normalized = value.strip.sub(/\A@+/, "")
      normalized.empty? ? nil : "@#{normalized}"
    end

    def stringify(value)
      value.is_a?(String) ? value : JSON.generate(value)
    end

    def to_responses_input(messages)
      messages.filter_map do |message|
        case message.role
        when "system"
          nil
        when "tool"
          {
            type: "function_call_output",
            call_id: message.tool_call_id,
            output: stringify(message.content)
          }
        else
          item = {
            type: "message",
            role: message.role,
            content: stringify(message.content)
          }
          if message.role == "assistant" && Array(message.tool_calls).any?
            item[:tool_calls] = message.tool_calls.map do |tool_call|
              {
                id: tool_call.id,
                type: "function",
                function: {
                  name: tool_call.name,
                  arguments: JSON.generate(tool_call.input || {})
                }
              }
            end
          end
          item
        end
      end
    end

    def to_instructions(messages, override)
      system_text = messages
        .select { |message| message.role == "system" && !message.content.to_s.strip.empty? }
        .map { |message| message.content.to_s.strip }
        .join("\n\n")
      return "#{override}\n\n#{system_text}" if override && !system_text.empty?
      override || (system_text.empty? ? nil : system_text)
    end

    def extract_tool_calls(response)
      items = response["output_items"] || response["output"] || []
      items.filter_map.with_index do |item, index|
        next unless item["type"].to_s.downcase == "function_call"
        ToolCall.new(
          id: item["call_id"] || "tool_call_#{index}",
          name: item["name"] || "tool",
          input: safe_parse_tool_input(item["arguments"])
        )
      end
    end

    def extract_assistant_text(response)
      items = response["output_items"] || response["output"] || []
      parts = []
      items.each do |item|
        next unless item["type"].to_s.downcase == "message"
        Array(item["content"]).each do |part|
          parts << part["text"] if part["type"].to_s.downcase == "output_text" && part["text"].is_a?(String)
        end
      end
      parts.join("\n\n")
    end

    def safe_parse_tool_input(raw)
      return {} if raw.nil? || raw.to_s.strip.empty?
      JSON.parse(raw)
    rescue JSON::ParserError
      { "raw" => raw }
    end
  end

  class Agent
    def initialize(definition)
      @definition = definition
      @definition.tools ||= []
      @definition.max_steps ||= 8
    end

    def run(input:, client:, context: nil, model: nil, max_steps: nil)
      run_id = SecureRandom.uuid
      messages = []
      messages << Message.new(role: "system", content: @definition.instructions) if @definition.instructions
      messages << Message.new(role: "user", content: input.is_a?(String) ? input : JSON.pretty_generate(input))
      steps = []
      tool_index = @definition.tools.to_h { |tool| [tool.id, tool] }
      effective_max_steps = max_steps || @definition.max_steps || 8

      effective_max_steps.times do |step_index|
        response = client.generate(
          ModelRequest.new(
            agent_id: @definition.id,
            model: model || @definition.model,
            instructions: @definition.instructions,
            messages: messages,
            tools: @definition.tools,
            context: context
          )
        )
        messages << response.message
        steps << RunStep.new(
          index: step_index,
          tool_calls: Array(response.message.tool_calls),
          request_id: response.request_id,
          provider: response.provider,
          model: response.model
        )

        if Array(response.message.tool_calls).empty?
          output = @definition.parse_output ? @definition.parse_output.call(response.message.content) : response.message.content
          run = RunRecord.new(
            id: run_id,
            agent_id: @definition.id,
            status: "completed",
            input: input,
            messages: messages,
            step_count: steps.length,
            result: output
          )
          return RunResult.new(run: run, steps: steps, output: output, messages: messages)
        end

        response.message.tool_calls.each do |tool_call|
          tool = tool_index[tool_call.name]
          raise "Unknown tool '#{tool_call.name}'" unless tool
          tool_output = tool.execute.call(
            tool_call.input,
            RuntimeContext.new(run_id: run_id, agent_id: @definition.id, step_index: step_index, context: context)
          )
          messages << Message.new(
            role: "tool",
            name: tool.id,
            tool_call_id: tool_call.id,
            content: tool_output.is_a?(String) ? tool_output : JSON.generate(tool_output)
          )
        end
      end

      raise "Agent exceeded max_steps=#{effective_max_steps}"
    end
  end
end
