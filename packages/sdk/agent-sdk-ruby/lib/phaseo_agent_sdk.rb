require "json"
require "securerandom"
require "fileutils"
require "timeout"
require "time"
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
  Message = Struct.new(:role, :content, :tool_calls, :tool_call_id, :name, :is_error, keyword_init: true)
  Tool = Struct.new(:id, :execute, :description, :parameters, :timeout_ms, :input_schema, :output_schema, :event_schema, :require_approval, :on_tool_called, :on_response_received, :next_turn_params, :on_error, keyword_init: true)
  RuntimeContext = Struct.new(:run_id, :agent_id, :step_index, :context, :tool_call, :emit_progress, :set_context, keyword_init: true)
  ModelRequest = Struct.new(:agent_id, :messages, :tools, :model, :instructions, :context, :temperature, :max_output_tokens, :top_p, keyword_init: true)
  ModelResponse = Struct.new(:message, :usage, :request_id, :native_response_id, :provider, :model, :response_meta, :finish_reason, :cost, :warnings, keyword_init: true)
  AgentDefinition = Struct.new(:id, :model, :preset, :instructions, :tools, :max_steps, :parse_output, :human_review, :model_retry, :tool_execution, :stop_when, :output_schema, :require_approval, :temperature, :max_output_tokens, :top_p, :dynamic_tools, keyword_init: true)
  RunStep = Struct.new(:index, :status, :tool_calls, :request_id, :native_response_id, :provider, :model, :model_attempts, :usage, :response_meta, :error, :finish_reason, :warnings, keyword_init: true)
  HumanReviewRequest = Struct.new(:reason, :payload, keyword_init: true)
  PendingToolCall = Struct.new(:call, :kind, :reason, keyword_init: true)
  ToolDecision = Struct.new(:tool_call_id, :reason, keyword_init: true)
  ToolOutput = Struct.new(:tool_call_id, :output, keyword_init: true)
  HumanPause = Struct.new(:reason, :payload, :requested_at, :kind, :pending_tool_calls, keyword_init: true)
  HumanReviewContext = Struct.new(:run_id, :agent_id, :step_index, :input, :context, :messages, :response, :parsed_output, keyword_init: true)
  RunRecord = Struct.new(:id, :agent_id, :status, :input, :context, :messages, :step_count, :result, :error, :pause, :created_at, :updated_at, :stop_reason, :usage, :next_turn_params, keyword_init: true)
  RunResult = Struct.new(:run, :steps, :output, :messages, :usage, keyword_init: true)
  DevtoolsConfig = Struct.new(:enabled, :directory, keyword_init: true)
  class StreamResult
	def initialize(&work)
	  @events=[];@mutex=Mutex.new;@condition=ConditionVariable.new;@done=false
	  @worker=Thread.new do
		begin;@result=work.call(method(:push));rescue Exception=>error;@error=error;ensure;@mutex.synchronize{@done=true;@condition.broadcast};end
	  end
	end
	def push(event)=@mutex.synchronize{@events<<event;@condition.broadcast}
	def result;@worker.join;raise @error if @error;@result;end
	def cancel;@worker.kill if @worker&.alive?;@mutex.synchronize{@done=true;@condition.broadcast};end
	def full_stream
	  Enumerator.new do|yielded|;index=0;loop do;event=nil;finished=false;@mutex.synchronize do;@condition.wait(@mutex) while index>=@events.length&&!@done;event=@events[index] if index<@events.length;index+=1 if event;finished=@done&&event.nil?;end;break if finished;yielded<<event if event;end;raise @error if @error;end
	end
	def text_stream = full_stream.lazy.select{|event|event[:type]=="response.output_text.delta"}.map{|event|event[:delta].to_s}
	def reasoning_stream = full_stream.lazy.select{|event|event[:type]=="response.reasoning.delta"}.map{|event|event[:delta].to_s}
	def item_stream = full_stream.lazy.select{|event|event[:type]=="response.item"}.map{|event|event[:item]}
  end

  def self.define_tool(tool)
    tool
  end

  def self.create_agent(definition)
    Agent.new(definition.is_a?(AgentDefinition) ? definition : AgentDefinition.new(**definition))
  end

  def self.create_gateway_agent_client(**options)
    GatewayAgentClient.new(**options)
  end

  def self.create_agent_devtools(directory: ".phaseo-devtools", enabled: true)
    DevtoolsConfig.new(enabled: enabled, directory: directory)
  end
  def self.step_count_is(limit)=->(state){"step_count:#{limit}" if state[:step_count]>=limit}
  def self.max_tokens_used(limit)=->(state){"max_tokens:#{limit}" if state[:usage][:total_tokens]>=limit}
  def self.max_cost(limit)=->(state){"max_cost:#{limit}" if state[:usage][:cost]>=limit}
  def self.max_duration(milliseconds)=->(state){"max_duration:#{milliseconds}" if state[:elapsed_ms]>=milliseconds}
  def self.has_tool_call(name)=->(state){"tool_call:#{name}" if state[:tool_calls].any?{|call|call.name==name}}
  def self.finish_reason_is(reason)=->(state){"finish_reason:#{reason}" if state[:finish_reason]==reason}

  class GatewayAgentClient
    def initialize(client: nil, api_key: nil, base_url: nil, model: nil, preset: nil, provider: nil, reasoning: nil,
                   temperature: nil, max_output_tokens: nil, parallel_tool_calls: nil, metadata: nil, user: nil,
                   response_format: nil, include_meta: nil, web_search_options: nil, plugins: nil, gateway_tools: nil,
                   tool_choice: nil, provider_options: nil, prompt_cache_key: nil, request_options: nil)
      api_key ||= ENV["PHASEO_API_KEY"]
      @client = client || PhaseoSdk::Phaseo.new(
        api_key: api_key,
        base_path: base_url || ENV.fetch("PHASEO_BASE_URL", "https://api.phaseo.app/v1"),
        client_source: "phaseo-agent-ruby",
        client_source_version: "0.3.0"
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
      @request_options = request_options || {}
    end

    def generate(request)
	  response = @client.create_response(payload(request))
	  model_response(response)
	end

	def stream(request)
	  return enum_for(__method__,request) unless block_given?
	  @client.stream_response(payload(request).merge(stream:true)).each do |line|
		next unless line.start_with?("data:");data=line.delete_prefix("data:").strip;next if data.empty?||data=="[DONE]";begin;raw=JSON.parse(data);rescue JSON::ParserError;next;end;type=raw["type"].to_s;delta=raw["delta"].is_a?(String)?raw["delta"]:(raw["text"].is_a?(String)?raw["text"]:nil)
		if type=="response.completed";yield(type:"response.completed",response:model_response(raw["response"].is_a?(Hash)?raw["response"]:raw),raw:raw);return;end
		yield(type:"response.item",item:raw["item"],raw:raw) if raw.key?("item");yield(type:type.include?("reasoning")?"response.reasoning.delta":"response.output_text.delta",delta:delta,raw:raw) if delta
	  end
	end

	private

	def payload(request)
	  {
        **@request_options,
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
        temperature: request.temperature || @temperature,
        max_output_tokens: request.max_output_tokens || @max_output_tokens,
        top_p: request.top_p,
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

	end

	def model_response(response)
	  usage=response["usage"].is_a?(Hash)?response["usage"]:{};meta=response["meta"].is_a?(Hash)?response["meta"]:{};cost=[response["cost"],response["cost_usd"],usage["cost"],meta["cost"],meta["cost_usd"]].find{|value|value.is_a?(Numeric)};cost=response["cost_nanos"].to_f/1_000_000_000 if !cost&&response["cost_nanos"].is_a?(Numeric);cost=meta["cost_nanos"].to_f/1_000_000_000 if !cost&&meta["cost_nanos"].is_a?(Numeric)
	  ModelResponse.new(
        message: Message.new(
          role: "assistant",
          content: extract_assistant_text(response),
          tool_calls: extract_tool_calls(response)
        ),
		usage: usage,
		request_id: response["request_id"]||response["id"],
		native_response_id:response["native_response_id"]||response["nativeResponseId"],
        provider: response["provider"],
        model: response["model"],
		response_meta: meta,finish_reason:response["finish_reason"]||response["stop_reason"]||response["status"],cost:cost.to_f,warnings:Array(response["warnings"])
	  )
	end

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
      @definition.max_steps ||= 12
      @definition.stop_when ||= []
      @definition.tools.each { |tool| tool.on_error ||= "fail-run" }
    end

    def run(input:, client:, context: nil, model: nil, preset: nil, max_steps: nil, model_retry: nil,
            tool_execution: nil, on_event: nil, devtools: nil, state: nil)
      started_at = Time.now
      run_id = SecureRandom.uuid
      created_at = now_iso
      messages = []
      messages << Message.new(role: "system", content: @definition.instructions) if @definition.instructions.is_a?(String) && !@definition.instructions.empty?
      messages << Message.new(role: "user", content: input.is_a?(String) ? input : JSON.pretty_generate(input))
      run_record = RunRecord.new(
        id: run_id, agent_id: @definition.id, status: "queued", input: input, context: context,
        messages: messages, step_count: 0, created_at: created_at, updated_at: created_at,
        usage: { input_tokens: 0, output_tokens: 0, cached_tokens: 0, total_tokens: 0, cost: 0.0 }
      )
      emit(on_event, "run.started", run_record)
      begin
        result = execute(
          run_record, [], client: client, context: context, model: model, preset: preset,
          max_steps: max_steps, model_retry: model_retry, tool_execution: tool_execution,
          on_event: on_event
        )
        capture_devtools(result, "agent.run", started_at, devtools)
        state.save(result) if state
        result
      rescue StandardError => e
        capture_devtools(nil, "agent.run", started_at, devtools, e, run_id)
        raise
      end
    end

    def stream(input:, client:, context: nil, state: nil)
	  StreamResult.new do|emit|
		handler=emit
		if client.respond_to?(:stream)
		  source=client
		  client=Class.new do
			define_method(:generate) do |request|
			  text=String.new;completed=nil
			  source.stream(request).each do |event|;text<<event[:delta].to_s if event[:type]=="response.output_text.delta";completed=event[:response] if event[:type]=="response.completed";handler.call(event);end
			  completed||ModelResponse.new(message:Message.new(role:"assistant",content:text))
			end
		  end.new
		end
		run(input:input,client:client,context:context,on_event:handler,state:state)
	  end
	end

    def continue_run(run: nil, run_id: nil, client:, human_input: nil, context: nil, model: nil, preset: nil, max_steps: nil,
                     model_retry: nil, tool_execution: nil, on_event: nil, devtools: nil, approvals: [], rejections: [], tool_outputs: [], state: nil)
      run ||= state&.load(run_id);raise "A run or state accessor with run_id is required" unless run
      raise "Run #{run.run.id} belongs to agent #{run.run.agent_id}" unless run.run.agent_id == @definition.id
      if run.run.status == "waiting_for_human" && human_input.to_s.empty? && Array(run.run.pause&.pending_tool_calls).empty?
        raise "Run #{run.run.id} is waiting for human input"
      end
      started_at = Time.now
      previous_status = run.run.status
      unless human_input.to_s.empty?
        run.run.messages << Message.new(role: "user", content: human_input)
        run.run.pause = nil
      else
        approved=approvals.to_h{|item|[item.is_a?(String)?item:item.tool_call_id,item]}; rejected=rejections.to_h{|item|[item.is_a?(String)?item:item.tool_call_id,item]}; outputs=tool_outputs.to_h{|item|[item.tool_call_id,item.output]}; tools=@definition.tools.to_h{|item|[item.id,item]}
        Array(run.run.pause&.pending_tool_calls).each do |pending|
		  call=pending.call; tool=tools[call.name]; runtime=RuntimeContext.new(run_id:run.run.id,agent_id:run.run.agent_id,step_index:run.run.step_count-1,context:run.run.context,tool_call:call,set_context:->(value){run.run.context=value})
          if rejected.key?(call.id); reason=rejected[call.id].is_a?(String) ? "Tool call rejected" : (rejected[call.id].reason||"Tool call rejected"); run.run.messages<<Message.new(role:"tool",name:tool.id,tool_call_id:call.id,content:JSON.generate(error:reason),is_error:true); next; end
		  if pending.kind=="approval"; raise "Missing approval decision for tool call #{call.id}" unless approved.key?(call.id); run.run.messages<<execute_tool(tool,call,run.run,run.run.step_count-1,on_event);run.run.next_turn_params=tool.next_turn_params if tool.next_turn_params;next
          else; raise "Missing output for tool call #{call.id}" unless outputs.key?(call.id); value=outputs[call.id]; value=tool.on_response_received.call(value,runtime) if tool.on_response_received; end
		  value=validate(tool.output_schema,value,"tool output"); run.run.messages<<Message.new(role:"tool",name:tool.id,tool_call_id:call.id,content:value.is_a?(String)?value:JSON.generate(value));run.run.next_turn_params=tool.next_turn_params if tool.next_turn_params
        end
        run.run.pause=nil
      end
      run.run.status = "running"
      run.run.updated_at = now_iso
      emit(on_event, "run.resumed", run.run, previous_status: previous_status)
      begin
        result = execute(
          run.run, run.steps.dup, client: client, context: context.nil? ? run.run.context : context,
          model: model, preset: preset, max_steps: max_steps, model_retry: model_retry,
          tool_execution: tool_execution, on_event: on_event
        )
        capture_devtools(result, "agent.continue", started_at, devtools)
        state.save(result) if state
        result
      rescue StandardError => e
        capture_devtools(nil, "agent.continue", started_at, devtools, e, run.run.id)
        raise
      end
    end

	def continue_stream(**options)
	  StreamResult.new do|emit|
		client=options.fetch(:client);if client.respond_to?(:stream);source=client;client=Class.new do;define_method(:generate) do|request|;text=String.new;completed=nil;source.stream(request).each{|event|text<<event[:delta].to_s if event[:type]=="response.output_text.delta";completed=event[:response] if event[:type]=="response.completed";emit.call(event)};completed||ModelResponse.new(message:Message.new(role:"assistant",content:text));end;end.new;end
		continue_run(**options.merge(client:client,on_event:emit))
	  end
	end

    private

	def execute_tool(tool,call,run,step_index,on_event)
	  emit(on_event,"tool.started",run,step_index:step_index,tool_call_id:call.id,tool_name:call.name);progress=proc{|value|checked=validate(tool.event_schema,value,"tool progress event");emit(on_event,"tool.preliminary_result",run,step_index:step_index,tool_call_id:call.id,tool_name:call.name,result:checked)};runtime=RuntimeContext.new(run_id:run.id,agent_id:run.agent_id,step_index:step_index,context:run.context,tool_call:call,emit_progress:progress,set_context:->(value){run.context=value})
	  begin;output=tool.timeout_ms ? Timeout.timeout(tool.timeout_ms/1000.0){tool.execute.call(call.input,runtime)}:tool.execute.call(call.input,runtime);output=validate(tool.output_schema,output,"tool output")
	  rescue StandardError=>error;emit(on_event,"tool.failed",run,step_index:step_index,tool_call_id:call.id,tool_name:call.name,error:error.message);raise unless tool.on_error=="return-to-model";return Message.new(role:"tool",name:tool.id,tool_call_id:call.id,content:JSON.generate(error:error.message),is_error:true);end
	  emit(on_event,"tool.completed",run,step_index:step_index,tool_call_id:call.id,tool_name:call.name,output:output);Message.new(role:"tool",name:tool.id,tool_call_id:call.id,content:output.is_a?(String)?output:JSON.generate(output))
	end

    def execute(run, steps, client:, context:, model:, preset:, max_steps:, model_retry:, tool_execution:, on_event:)
      run.status = "running"
      effective_max_steps = max_steps || @definition.max_steps || 12
      retry_config = { max_retries: 0, backoff_ms: 250 }.merge(@definition.model_retry || {}).merge(model_retry || {})
      execution_config = { tool_concurrency: 1 }.merge(@definition.tool_execution || {}).merge(tool_execution || {})
      target_model = [model, preset_alias(preset), @definition.model.is_a?(String) ? @definition.model : nil, preset_alias(@definition.preset)].find { |item| !item.to_s.strip.empty? };next_turn=run.next_turn_params;run.next_turn_params=nil;loop_started=Process.clock_gettime(Process::CLOCK_MONOTONIC)
      tool_index = @definition.tools.to_h { |tool| [tool.id, tool] }

      (run.step_count...effective_max_steps).each do |step_index|
        turn={number_of_turns:step_index+1,step_index:step_index,messages:run.messages.dup,context:run.context};turn_model=@definition.model.respond_to?(:call) ? @definition.model.call(turn) : target_model;turn_instructions=@definition.instructions.respond_to?(:call) ? @definition.instructions.call(turn) : @definition.instructions;temperature=@definition.temperature.respond_to?(:call) ? @definition.temperature.call(turn) : @definition.temperature;max_output=@definition.max_output_tokens.respond_to?(:call) ? @definition.max_output_tokens.call(turn) : @definition.max_output_tokens;top_p=@definition.top_p.respond_to?(:call) ? @definition.top_p.call(turn) : @definition.top_p;turn_tools=@definition.dynamic_tools.respond_to?(:call) ? @definition.dynamic_tools.call(turn) : @definition.tools;if next_turn;turn_model=next_turn[:model]||turn_model;turn_instructions=next_turn[:instructions]||turn_instructions;temperature=next_turn[:temperature]||temperature;max_output=next_turn[:max_output_tokens]||max_output;top_p=next_turn[:top_p]||top_p;turn_tools=next_turn[:tools]||turn_tools;next_turn=nil;end;tool_index=turn_tools.to_h{|tool|[tool.id,tool]}
        step = RunStep.new(index: step_index, status: "executing_model", tool_calls: [], model_attempts: 0)
        steps << step
        emit(on_event, "step.started", run, step_index: step_index)
        response = nil
        (retry_config[:max_retries].to_i + 1).times do |attempt|
          step.model_attempts = attempt + 1
          emit(on_event, "model.requested", run, step_index: step_index, attempt: attempt + 1, model: turn_model)
          begin
            response = client.generate(
              ModelRequest.new(
                agent_id: @definition.id, model: turn_model, instructions: turn_instructions,
                messages: run.messages, tools: turn_tools, context: run.context,temperature:temperature,max_output_tokens:max_output,top_p:top_p
              )
            )
            break
          rescue StandardError
            raise if attempt >= retry_config[:max_retries].to_i
            sleep(retry_config[:backoff_ms].to_i * (attempt + 1) / 1000.0)
          end
        end

        run.messages << response.message
        run.step_count = step_index + 1
        run.updated_at = now_iso
        step.tool_calls = Array(response.message.tool_calls)
        step.request_id = response.request_id
        step.native_response_id = response.native_response_id
        step.provider = response.provider
        step.model = response.model || turn_model
        step.usage = response.usage
        step.response_meta = response.response_meta
        step.finish_reason=response.finish_reason;step.warnings=Array(response.warnings)
        current_usage=normalized_usage(response); current_usage.each{|key,value|run.usage[key]=(run.usage[key]||0)+value}
        emit(on_event, "model.completed", run, step_index: step_index, attempt: step.model_attempts, request_id: step.request_id, model: step.model)

        parsed_output = if step.tool_calls.empty? && @definition.parse_output
                          @definition.parse_output.call(response.message.content)
                        end
        if @definition.human_review
          review = @definition.human_review.call(
            HumanReviewContext.new(
              run_id: run.id, agent_id: run.agent_id, step_index: step_index, input: run.input,
              context: context, messages: run.messages.dup, response: response, parsed_output: parsed_output
            )
          )
          if review
            run.status = "waiting_for_human"
            run.pause = HumanPause.new(reason: review.reason, payload: review.payload, requested_at: now_iso)
            step.status = "checkpointed"
            emit(on_event, "checkpoint.saved", run, step_index: step_index)
            emit(on_event, "run.waiting_for_human", run, step_index: step_index, pause: run.pause.to_h)
            return RunResult.new(run: run, steps: steps, output: nil, messages: run.messages)
          end
        end

        if step.tool_calls.empty?
          output = @definition.parse_output ? parsed_output : response.message.content
          output=validate(@definition.output_schema,output,"agent output")
          @definition.stop_when.each do |condition|
            reason=condition.call(step_count:run.step_count,usage:run.usage,tool_calls:[],finish_reason:response.finish_reason,elapsed_ms:(Process.clock_gettime(Process::CLOCK_MONOTONIC)-loop_started)*1000)
            if reason; run.status="stopped";run.stop_reason=reason.to_s;run.result=output;return RunResult.new(run:run,steps:steps,output:output,messages:run.messages,usage:run.usage);end
          end
          run.status = "completed"
          run.result = output
          run.pause = nil
          step.status = "checkpointed"
          emit(on_event, "checkpoint.saved", run, step_index: step_index)
          emit(on_event, "run.completed", run, output: output)
          return RunResult.new(run: run, steps: steps, output: output, messages: run.messages, usage: run.usage)
        end

        run.status = "waiting_for_tools"
        step.status = "executing_tools"
        pending=[]; calls=[]
        step.tool_calls.each do |call|
          tool=tool_index[call.name];raise "Unknown tool '#{call.name}'" unless tool;call.input=validate(tool.input_schema,call.input,"tool input");runtime=RuntimeContext.new(run_id:run.id,agent_id:run.agent_id,step_index:step_index,context:run.context,tool_call:call)
          if tool.on_tool_called;prefetched=tool.on_tool_called.call(call.input,runtime);if prefetched.nil?;pending<<PendingToolCall.new(call:call,kind:"hitl",reason:"Tool requires human input");else;value=validate(tool.output_schema,prefetched,"tool output");run.messages<<Message.new(role:"tool",name:tool.id,tool_call_id:call.id,content:value.is_a?(String)?value:JSON.generate(value));end;next;end
          gated=tool.require_approval.respond_to?(:call) ? tool.require_approval.call(call.input,runtime) : !!tool.require_approval;gated=@definition.require_approval.call(call,runtime) if @definition.require_approval
          if gated;pending<<PendingToolCall.new(call:call,kind:"approval",reason:"Tool requires approval");elsif tool.execute.nil?;pending<<PendingToolCall.new(call:call,kind:"manual",reason:"Tool requires external output");else;calls<<call;end
        end
		messages = Array.new(calls.length);context_updates=Array.new(calls.length);context_was_set=Array.new(calls.length,false);next_turn_updates=Array.new(calls.length)
        queue = Queue.new
        calls.each_with_index { |call, index| queue << [call, index] }
        errors = Queue.new
        execution_config[:tool_concurrency].to_i.clamp(1, [calls.length, 1].max).times.map do
          Thread.new do
            loop do
              call, index = queue.pop(true)
              tool = tool_index[call.name]
              raise "Unknown tool '#{call.name}'" unless tool
              emit(on_event, "tool.started", run, step_index: step_index, tool_call_id: call.id, tool_name: call.name)
              progress=proc{|value|checked=validate(tool.event_schema,value,"tool progress event");emit(on_event,"tool.preliminary_result",run,step_index:step_index,tool_call_id:call.id,tool_name:call.name,result:checked)}
			  local_context=run.context;runtime=RuntimeContext.new(run_id:run.id,agent_id:run.agent_id,step_index:step_index,context:local_context,tool_call:call,emit_progress:progress,set_context:->(value){local_context=value;context_updates[index]=value;context_was_set[index]=true})
              begin;output = tool.timeout_ms ? Timeout.timeout(tool.timeout_ms / 1000.0) { tool.execute.call(call.input,runtime) } : tool.execute.call(call.input,runtime);output=validate(tool.output_schema,output,"tool output")
              rescue StandardError=>e;raise unless tool.on_error=="return-to-model";messages[index]=Message.new(role:"tool",name:tool.id,tool_call_id:call.id,content:JSON.generate(error:e.message),is_error:true);emit(on_event,"tool.failed",run,tool_call_id:call.id,tool_name:call.name,error:e.message);next;end
              messages[index] = Message.new(role: "tool", name: tool.id, tool_call_id: call.id, content: output.is_a?(String) ? output : JSON.generate(output))
              emit(on_event, "tool.completed", run, step_index: step_index, tool_call_id: call.id, tool_name: call.name, output: output)
			  next_turn_updates[index]=tool.next_turn_params if tool.next_turn_params
            rescue ThreadError
              break
            rescue StandardError => e
              errors << e
              break
            end
          end
        end.each(&:join)
		raise errors.pop unless errors.empty?
		context_updates.each_with_index{|value,index|run.context=value if context_was_set[index]};next_turn_updates.each{|value|next_turn=value if value}
        run.messages.concat(messages)
        unless pending.empty?;run.status="waiting_for_human";run.next_turn_params=next_turn;run.pause=HumanPause.new(reason:"Pending tool calls require input",payload:pending,requested_at:now_iso,kind:pending.any?{|item|item.kind=="approval"}?"tool_approval":pending.first.kind,pending_tool_calls:pending);step.status="checkpointed";emit(on_event,"run.waiting_for_human",run,step_index:step_index,pause:run.pause.to_h);return RunResult.new(run:run,steps:steps,output:nil,messages:run.messages,usage:run.usage);end
        @definition.stop_when.each do|condition|;reason=condition.call(step_count:run.step_count,usage:run.usage,tool_calls:step.tool_calls,finish_reason:response.finish_reason,elapsed_ms:(Process.clock_gettime(Process::CLOCK_MONOTONIC)-loop_started)*1000);if reason;run.status="stopped";run.stop_reason=reason.to_s;run.result=response.message.content;return RunResult.new(run:run,steps:steps,output:run.result,messages:run.messages,usage:run.usage);end;end
        step.status = "checkpointed"
        emit(on_event, "checkpoint.saved", run, step_index: step_index)
      end

      run.status = "failed"
      run.error = "Max steps exceeded (#{effective_max_steps})"
      emit(on_event, "run.failed", run, error: run.error)
      raise run.error
    end

    def preset_alias(value)
      normalized = value.to_s.strip.sub(/\A@+/, "")
      normalized.empty? ? nil : "@#{normalized}"
    end

    def validate(schema,value,label)
      return value unless schema.respond_to?(:call)
      schema.call(value)
    rescue StandardError=>e
      raise ArgumentError,"Invalid #{label}: #{e.message}"
    end

    def normalized_usage(response)
      raw=response.usage||{};input=(raw["input_tokens"]||raw[:input_tokens]||raw["prompt_tokens"]||0).to_i;output=(raw["output_tokens"]||raw[:output_tokens]||raw["completion_tokens"]||0).to_i
      {input_tokens:input,output_tokens:output,cached_tokens:(raw["cached_tokens"]||raw[:cached_tokens]||0).to_i,total_tokens:(raw["total_tokens"]||raw[:total_tokens]||input+output).to_i,cost:(response.cost||0).to_f}
    end

    def now_iso
      Time.now.utc.iso8601(6)
    end

    def emit(handler, type, run, details = {})
      handler&.call({ type: type, run_id: run.id, agent_id: run.agent_id, timestamp: now_iso, status: run.status }.merge(details))
    end

    def capture_devtools(result, operation, started_at, config, error = nil, run_id = nil)
      enabled = config ? config.enabled : ENV["PHASEO_DEVTOOLS"] == "true"
      return unless enabled
      directory = config&.directory || ENV["PHASEO_DEVTOOLS_DIR"] || ".phaseo-devtools"
      %w[images audio video].each { |kind| FileUtils.mkdir_p(File.join(directory, "assets", kind)) }
      metadata_path = File.join(directory, "metadata.json")
      File.write(metadata_path, JSON.pretty_generate(session_id: SecureRandom.uuid, started_at: (started_at.to_f * 1000).to_i, sdk: "ruby")) unless File.exist?(metadata_path)
      record = result&.run
      metadata = { sdk: "ruby", agent_id: @definition.id, run_id: record&.id || run_id, run_status: record&.status }
      error_info = nil
      if error
        error_info = { message: error.message, type: error.class.name }
        if error.respond_to?(:status_code)
          values = {
            status_code: error.status_code,
            request_id: error.respond_to?(:request_id) ? error.request_id : nil,
            generation_id: error.respond_to?(:generation_id) ? error.generation_id : nil,
            code: error.respond_to?(:code) ? error.code : nil,
            error_type: error.respond_to?(:error_type) ? error.error_type : nil,
            error_origin: error.respond_to?(:error_origin) ? error.error_origin : nil,
            retryable: error.respond_to?(:retryable) ? error.retryable : nil,
            action: error.respond_to?(:action) ? error.action : nil,
            docs_url: error.respond_to?(:docs_url) ? error.docs_url : nil,
            support_url: error.respond_to?(:support_url) ? error.support_url : nil,
            retry_after_seconds: error.respond_to?(:retry_after_seconds) ? error.retry_after_seconds : nil,
            details: error.respond_to?(:details) ? error.details : nil
          }.compact
          error_info.merge!(values)
          metadata.merge!(values)
        end
      end
      entry = {
        id: record&.id || run_id || SecureRandom.uuid, type: operation, timestamp: (started_at.to_f * 1000).to_i,
        request: { agent_id: @definition.id, tool_count: @definition.tools.length },
        response: result ? deep_hash(result) : nil, error: error_info,
        metadata: metadata
      }
      File.open(File.join(directory, "generations.jsonl"), "a") { |file| file.puts(JSON.generate(entry)) }
    end

    def deep_hash(value)
      return value.to_h.transform_values { |item| deep_hash(item) } if value.is_a?(Struct)
      return value.map { |item| deep_hash(item) } if value.is_a?(Array)
      return value.transform_values { |item| deep_hash(item) } if value.is_a?(Hash)
      value
    end
  end
end
