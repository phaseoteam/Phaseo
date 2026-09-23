package app.phaseo.agent;

import app.phaseo.gen.Client.ApiException;
import app.phaseo.sdk.Phaseo;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Function;

/** Local agent runtime backed by the Phaseo Responses API. */
public final class AgentSdk {
  private static final ObjectMapper JSON = new ObjectMapper();

  private AgentSdk() {}

  public record ToolCall(String id, String name, Object input) {}
  public record Message(String role, String content, List<ToolCall> toolCalls, String toolCallId, String name) {
    public Message(String role, String content) { this(role, content, List.of(), null, null); }
  }
  @FunctionalInterface public interface ToolExecutor { Object execute(Object input, RuntimeContext context) throws Exception; }
  @FunctionalInterface public interface Validator { Object validate(Object value) throws Exception; }
  @FunctionalInterface public interface Approval { boolean approve(Object input, RuntimeContext context) throws Exception; }
  @FunctionalInterface public interface ToolCalled { ToolCalledResult call(Object input, RuntimeContext context) throws Exception; }
  @FunctionalInterface public interface ToolResponse { Object receive(Object value, RuntimeContext context) throws Exception; }
  public record ToolCalledResult(boolean completed, Object output) {}
  public record NextTurnParams(String model,String instructions,Double temperature,Integer maxOutputTokens,Double topP,List<Tool> tools) {}
  public record TurnContext(int numberOfTurns,int stepIndex,List<Message> messages,Object context,ToolCall lastToolCall) {}
  public record Tool(String id, ToolExecutor execute, String description, Map<String, Object> parameters, Duration timeout,
                     Validator inputSchema, Validator outputSchema, Validator eventSchema, boolean requireApproval,
                     Approval approval, ToolCalled onToolCalled, ToolResponse onResponseReceived, String onError, NextTurnParams nextTurnParams) {
    public Tool(String id, ToolExecutor execute) { this(id, execute, null, null, null); }
    public Tool(String id, ToolExecutor execute, String description, Map<String, Object> parameters, Duration timeout) {
      this(id, execute, description, parameters, timeout, null, null, null, false, null, null, null, "fail-run",null);
    }
    public Tool(String id,ToolExecutor execute,String description,Map<String,Object> parameters,Duration timeout,Validator inputSchema,Validator outputSchema,Validator eventSchema,boolean requireApproval,Approval approval,ToolCalled onToolCalled,ToolResponse onResponseReceived,String onError){this(id,execute,description,parameters,timeout,inputSchema,outputSchema,eventSchema,requireApproval,approval,onToolCalled,onResponseReceived,onError,null);}
  }
  public record RuntimeContext(String runId, String agentId, int stepIndex, Object context, ToolCall toolCall, ToolResponse emitProgress, Consumer<Object> setContext) {
    public RuntimeContext(String runId, String agentId, int stepIndex, Object context) { this(runId, agentId, stepIndex, context, null, null, null); }
  }
  public record ModelRequest(String agentId, List<Message> messages, List<Tool> tools, String model, String instructions, Object context, Double temperature,Integer maxOutputTokens,Double topP) { public ModelRequest(String agentId,List<Message>messages,List<Tool>tools,String model,String instructions,Object context){this(agentId,messages,tools,model,instructions,context,null,null,null);} }
  public record ModelResponse(Message message, Map<String, Object> usage, String requestId, String nativeResponseId, String provider, String model, Map<String, Object> responseMeta, String finishReason, double cost, List<Map<String,String>> warnings) {
    public ModelResponse(Message message) { this(message, null, null, null, null, null, null); }
    public ModelResponse(Message message, Map<String,Object> usage, String requestId, String nativeResponseId, String provider, String model, Map<String,Object> responseMeta) { this(message, usage, requestId, nativeResponseId, provider, model, responseMeta, null, 0, List.of()); }
  }
  @FunctionalInterface public interface ModelClient { ModelResponse generate(ModelRequest request) throws Exception; }
  public record ModelStreamEvent(String type, String delta, Object item, ModelResponse response) {}
  public interface StreamingModelClient extends ModelClient { Iterable<ModelStreamEvent> stream(ModelRequest request) throws Exception; }
  public interface StateAccessor { RunResult load(String runId) throws Exception; void save(RunResult result) throws Exception; }
  public static final class StreamResult {
    private final List<AgentEvent> events = new ArrayList<>(); private final CompletableFuture<RunResult> result = new CompletableFuture<>();
	private volatile Thread worker;
    private synchronized void push(AgentEvent event){events.add(event);notifyAll();} private void complete(RunResult value,Throwable error){if(error==null)result.complete(value);else result.completeExceptionally(error);synchronized(this){notifyAll();}}
    public RunResult getResult(){return result.join();} public synchronized List<AgentEvent> fullStream(){while(!result.isDone())try{wait();}catch(InterruptedException error){Thread.currentThread().interrupt();break;}return List.copyOf(events);} public List<String> textStream(){return fullStream().stream().filter(item->item.type().equals("response.output_text.delta")).map(item->String.valueOf(item.details().get("delta"))).toList();}
	public void cancel(){Thread current=worker;if(current!=null)current.interrupt();result.cancel(true);synchronized(this){notifyAll();}}
  }
  public record ModelRetryConfig(int maxRetries, Duration backoff) {
    public ModelRetryConfig { backoff = backoff == null ? Duration.ofMillis(250) : backoff; }
  }
  public record ToolExecutionConfig(int concurrency) {
    public ToolExecutionConfig { concurrency = Math.max(1, concurrency); }
  }
  public record HumanReviewRequest(String reason, Object payload) {}
  public record PendingToolCall(ToolCall call, String kind, String reason) {}
  public record ToolDecision(String toolCallId, String reason) { public ToolDecision(String id) { this(id, null); } }
  public record ToolOutput(String toolCallId, Object output) {}
  public record UsageSummary(int inputTokens, int outputTokens, int cachedTokens, int totalTokens, double cost) { public UsageSummary() { this(0,0,0,0,0); } }
  public record StopState(int stepCount, UsageSummary usage, List<ToolCall> toolCalls, String finishReason, Duration elapsed) {}
  @FunctionalInterface public interface StopCondition { String shouldStop(StopState state); }
  @FunctionalInterface public interface CallApproval { boolean approve(ToolCall call, RuntimeContext context) throws Exception; }
  public record HumanPause(String reason, Object payload, String requestedAt, String kind, List<PendingToolCall> pendingToolCalls) { public HumanPause(String reason, Object payload, String requestedAt) { this(reason,payload,requestedAt,"human_review",List.of()); } }
  public record HumanReviewContext(String runId, String agentId, int stepIndex, Object input, Object context, List<Message> messages, ModelResponse response, Object parsedOutput) {}
  @FunctionalInterface public interface HumanReview { HumanReviewRequest review(HumanReviewContext context) throws Exception; }
  public record AgentDefinition(String id, String model, String preset, String instructions, List<Tool> tools, int maxSteps, Function<String, Object> parseOutput, HumanReview humanReview, ModelRetryConfig modelRetry, ToolExecutionConfig toolExecution, List<StopCondition> stopWhen, Validator outputSchema, CallApproval requireApproval, Function<TurnContext,String> dynamicModel,Function<TurnContext,String> dynamicInstructions,Function<TurnContext,Double> temperature,Function<TurnContext,Integer> maxOutputTokens,Function<TurnContext,Double> topP,Function<TurnContext,List<Tool>> dynamicTools) {
    public AgentDefinition(String id, String model, String preset, String instructions, List<Tool> tools, int maxSteps, Function<String,Object> parseOutput, HumanReview humanReview, ModelRetryConfig modelRetry, ToolExecutionConfig toolExecution) { this(id,model,preset,instructions,tools,maxSteps,parseOutput,humanReview,modelRetry,toolExecution,List.of(),null,null,null,null,null,null,null,null); }
    public AgentDefinition(String id,String model,String preset,String instructions,List<Tool>tools,int maxSteps,Function<String,Object>parseOutput,HumanReview humanReview,ModelRetryConfig modelRetry,ToolExecutionConfig toolExecution,List<StopCondition>stopWhen,Validator outputSchema,CallApproval requireApproval){this(id,model,preset,instructions,tools,maxSteps,parseOutput,humanReview,modelRetry,toolExecution,stopWhen,outputSchema,requireApproval,null,null,null,null,null,null);}
    public AgentDefinition {
      Objects.requireNonNull(id, "id");
      tools = tools == null ? List.of() : List.copyOf(tools);
      maxSteps = maxSteps > 0 ? maxSteps : 12;
      modelRetry = modelRetry == null ? new ModelRetryConfig(0, null) : modelRetry;
      toolExecution = toolExecution == null ? new ToolExecutionConfig(1) : toolExecution;
      stopWhen = stopWhen == null ? List.of() : List.copyOf(stopWhen);
    }
  }
  public record RunStep(int index, String status, List<ToolCall> toolCalls, String requestId, String nativeResponseId, String provider, String model, int modelAttempts, Map<String, Object> usage, Map<String, Object> responseMeta, String error,String finishReason,List<Map<String,String>> warnings) { public RunStep(int index,String status,List<ToolCall>toolCalls,String requestId,String nativeResponseId,String provider,String model,int modelAttempts,Map<String,Object>usage,Map<String,Object>responseMeta,String error){this(index,status,toolCalls,requestId,nativeResponseId,provider,model,modelAttempts,usage,responseMeta,error,null,List.of());} }
  public record RunRecord(String id, String agentId, String status, Object input, Object context, List<Message> messages, int stepCount, Object result, String error, HumanPause pause, String createdAt, String updatedAt, String stopReason, UsageSummary usage, NextTurnParams nextTurn) {}
  public record RunResult(RunRecord run, List<RunStep> steps, Object output, List<Message> messages, UsageSummary usage) { public RunResult(RunRecord run,List<RunStep> steps,Object output,List<Message> messages){this(run,steps,output,messages,run.usage());} }
  public record AgentEvent(String type, String runId, String agentId, String timestamp, String status, Map<String, Object> details) {}
  public record DevtoolsConfig(boolean enabled, String directory) {
    public DevtoolsConfig { directory = directory == null || directory.isBlank() ? ".phaseo-devtools" : directory; }
  }
  public record RunOptions(Object input, ModelClient client, Object context, String model, String preset, Integer maxSteps, ModelRetryConfig modelRetry, ToolExecutionConfig toolExecution, Consumer<AgentEvent> onEvent, DevtoolsConfig devtools, StateAccessor state) { public RunOptions(Object input,ModelClient client,Object context,String model,String preset,Integer maxSteps,ModelRetryConfig modelRetry,ToolExecutionConfig toolExecution,Consumer<AgentEvent> onEvent,DevtoolsConfig devtools){this(input,client,context,model,preset,maxSteps,modelRetry,toolExecution,onEvent,devtools,null);} }
  public record ContinueOptions(RunResult run, ModelClient client, Object context, String model, String preset, Integer maxSteps, String humanInput, ModelRetryConfig modelRetry, ToolExecutionConfig toolExecution, Consumer<AgentEvent> onEvent, DevtoolsConfig devtools, List<ToolDecision> approvals, List<ToolDecision> rejections, List<ToolOutput> toolOutputs,String runId,StateAccessor state) {
    public ContinueOptions(RunResult run, ModelClient client, Object context, String model, String preset, Integer maxSteps, String humanInput, ModelRetryConfig modelRetry, ToolExecutionConfig toolExecution, Consumer<AgentEvent> onEvent, DevtoolsConfig devtools) { this(run,client,context,model,preset,maxSteps,humanInput,modelRetry,toolExecution,onEvent,devtools,List.of(),List.of(),List.of(),null,null); }
    public ContinueOptions(RunResult run,ModelClient client,Object context,String model,String preset,Integer maxSteps,String humanInput,ModelRetryConfig modelRetry,ToolExecutionConfig toolExecution,Consumer<AgentEvent> onEvent,DevtoolsConfig devtools,List<ToolDecision> approvals,List<ToolDecision> rejections,List<ToolOutput> toolOutputs){this(run,client,context,model,preset,maxSteps,humanInput,modelRetry,toolExecution,onEvent,devtools,approvals,rejections,toolOutputs,null,null);}
  }
  public record GatewayOptions(Phaseo client, String apiKey, String baseUrl, String model, String preset, Map<String, Object> requestOptions) {}

  public static Tool defineTool(Tool tool) { return tool; }
  public static StopCondition stepCountIs(int limit){return state->state.stepCount()>=limit?"step_count:"+limit:null;}
  public static StopCondition maxTokensUsed(int limit){return state->state.usage().totalTokens()>=limit?"max_tokens:"+limit:null;}
  public static StopCondition maxCost(double limit){return state->state.usage().cost()>=limit?"max_cost:"+limit:null;}
  public static StopCondition maxDuration(Duration limit){return state->state.elapsed().compareTo(limit)>=0?"max_duration:"+limit:null;}
  public static StopCondition hasToolCall(String name){return state->state.toolCalls().stream().anyMatch(call->call.name().equals(name))?"tool_call:"+name:null;}
  public static StopCondition finishReasonIs(String reason){return state->Objects.equals(state.finishReason(),reason)?"finish_reason:"+reason:null;}
  public static Agent createAgent(AgentDefinition definition) { return new Agent(definition); }
  public static DevtoolsConfig createAgentDevtools(String directory) { return new DevtoolsConfig(true, directory); }
  public static ModelClient createGatewayAgentClient() { return createGatewayAgentClient(new GatewayOptions(null, null, null, null, null, null)); }

  public static StreamingModelClient createGatewayAgentClient(GatewayOptions options) {
    Phaseo client = options.client();
    if (client == null) {
      String key = first(options.apiKey(), System.getenv("PHASEO_API_KEY"));
      if (key == null) throw new IllegalArgumentException("PHASEO_API_KEY is required");
      client = new Phaseo(key, options.baseUrl() == null ? "https://api.phaseo.app/v1" : options.baseUrl(), "phaseo-agent-java", "0.3.0");
    }
    Phaseo resolvedClient = client;
    return new StreamingModelClient() {
     public ModelResponse generate(ModelRequest request) throws Exception {
      Map<String, Object> payload = new LinkedHashMap<>();
      if (options.requestOptions() != null) payload.putAll(options.requestOptions());
      payload.put("model", first(request.model(), options.model(), presetAlias(options.preset()), "phaseo/free"));
      payload.put("input", toResponsesInput(request.messages()));
      String instructions = toInstructions(request.messages(), request.instructions());
      if (instructions != null) payload.put("instructions", instructions);
      List<Object> tools = new ArrayList<>();
      for (Tool tool : request.tools()) {
        tools.add(Map.of("type", "function", "function", Map.of(
          "name", tool.id(),
          "description", tool.description() == null ? "" : tool.description(),
          "parameters", tool.parameters() == null ? Map.of("type", "object", "additionalProperties", true) : tool.parameters()
        )));
      }
      Object nativeTools = payload.get("tools");
      if (nativeTools instanceof List<?> list) tools.addAll(list);
      if (!tools.isEmpty()) payload.put("tools", tools);
      if(request.temperature()!=null)payload.put("temperature",request.temperature());if(request.maxOutputTokens()!=null)payload.put("max_output_tokens",request.maxOutputTokens());if(request.topP()!=null)payload.put("top_p",request.topP());
      JsonNode response = resolvedClient.createResponse(payload);
		return modelResponse(response);
	  }
	  public Iterable<ModelStreamEvent> stream(ModelRequest request) throws Exception {
		Map<String,Object> payload=gatewayPayload(request,options); payload.put("stream",true);
		java.util.stream.Stream<String> lines=resolvedClient.streamResponse(payload);
		return () -> lines.filter(line->line.startsWith("data:" )).map(line->line.substring(5).trim()).filter(data->!data.isEmpty()&&!data.equals("[DONE]")).map(data->{
		  try { JsonNode raw=JSON.readTree(data);String type=text(raw,"type"),delta=first(text(raw,"delta"),text(raw,"text"));if("response.completed".equals(type)){JsonNode response=raw.has("response")?raw.get("response"):raw;return new ModelStreamEvent("response.completed",null,null,modelResponse(response));}if(raw.has("item"))return new ModelStreamEvent("response.item",null,JSON.convertValue(raw.get("item"),Object.class),null);if(type!=null&&type.contains("reasoning")&&delta!=null)return new ModelStreamEvent("response.reasoning.delta",delta,null,null);return new ModelStreamEvent("response.output_text.delta",delta,null,null);
		  } catch(Exception error){throw new RuntimeException(error);}
		}).iterator();
	  }
	};
  }

	private static Map<String,Object> gatewayPayload(ModelRequest request,GatewayOptions options){Map<String,Object> payload=new LinkedHashMap<>();if(options.requestOptions()!=null)payload.putAll(options.requestOptions());payload.put("model",first(request.model(),options.model(),presetAlias(options.preset()),"phaseo/free"));payload.put("input",toResponsesInput(request.messages()));String instructions=toInstructions(request.messages(),request.instructions());if(instructions!=null)payload.put("instructions",instructions);List<Object> tools=new ArrayList<>();for(Tool tool:request.tools())tools.add(Map.of("type","function","function",Map.of("name",tool.id(),"description",tool.description()==null?"":tool.description(),"parameters",tool.parameters()==null?Map.of("type","object","additionalProperties",true):tool.parameters())));Object nativeTools=payload.get("tools");if(nativeTools instanceof List<?> list)tools.addAll(list);if(!tools.isEmpty())payload.put("tools",tools);if(request.temperature()!=null)payload.put("temperature",request.temperature());if(request.maxOutputTokens()!=null)payload.put("max_output_tokens",request.maxOutputTokens());if(request.topP()!=null)payload.put("top_p",request.topP());return payload;}
	private static ModelResponse modelResponse(JsonNode response){Map<String,Object> usage=mapValue(response.get("usage")),meta=mapValue(response.get("meta"));double cost=number(response,"cost","cost_usd");if(cost==0&&usage!=null)cost=number(usage,"cost");if(cost==0&&meta!=null)cost=number(meta,"cost","cost_usd");if(cost==0)cost=number(response,"cost_nanos")/1_000_000_000d;if(cost==0&&meta!=null)cost=number(meta,"cost_nanos")/1_000_000_000d;List<Map<String,String>> warnings=new ArrayList<>();JsonNode warningNode=response.get("warnings");if(warningNode!=null&&warningNode.isArray())for(JsonNode item:warningNode)warnings.add(JSON.convertValue(item,new TypeReference<Map<String,String>>(){}));return new ModelResponse(new Message("assistant",assistantText(response),toolCalls(response),null,null),usage,first(text(response,"request_id"),text(response,"id")),first(text(response,"native_response_id"),text(response,"nativeResponseId")),text(response,"provider"),text(response,"model"),meta,first(text(response,"finish_reason"),text(response,"stop_reason"),text(response,"status")),cost,List.copyOf(warnings));}
	private static double number(JsonNode node,String...keys){if(node==null)return 0;for(String key:keys){JsonNode value=node.get(key);if(value!=null&&value.isNumber())return value.asDouble();}return 0;}
	private static double number(Map<String,Object> map,String...keys){if(map==null)return 0;for(String key:keys){Object value=map.get(key);if(value instanceof Number number)return number.doubleValue();}return 0;}

  public static final class Agent {
    private final AgentDefinition definition;
    private Agent(AgentDefinition definition) { this.definition = Objects.requireNonNull(definition); }

    public RunResult run(RunOptions options) throws Exception {
      Objects.requireNonNull(options.client(), "client");
      Instant started = Instant.now();
      String id = UUID.randomUUID().toString();
      String created = now();
      List<Message> messages = new ArrayList<>();
      if (definition.instructions() != null && !definition.instructions().isBlank()) messages.add(new Message("system", definition.instructions()));
      messages.add(new Message("user", stringify(options.input())));
      RunRecord run = new RunRecord(id, definition.id(), "queued", options.input(), options.context(), messages, 0, null, null, null, created, created, null, new UsageSummary(),null);
      emit(options.onEvent(), "run.started", run, null);
      try {
        RunResult result = execute(run, new ArrayList<>(), options.client(), options.context(), options.model(), options.preset(), options.maxSteps(), options.modelRetry(), options.toolExecution(), options.onEvent());
        if(options.state()!=null)options.state().save(result);
        capture(result, "agent.run", started, options.devtools(), null, id);
        return result;
      } catch (Exception error) {
        capture(null, "agent.run", started, options.devtools(), error, id);
        throw error;
      }
    }

    private record StreamingAdapter(StreamingModelClient client, Consumer<AgentEvent> handler) implements ModelClient {
      public ModelResponse generate(ModelRequest request) throws Exception { StringBuilder text=new StringBuilder();ModelResponse completed=null;for(ModelStreamEvent item:client.stream(request)){if(item.type().equals("response.output_text.delta"))text.append(item.delta());if(item.type().equals("response.completed"))completed=item.response();if(handler!=null)handler.accept(new AgentEvent(item.type(),"stream",request.agentId(),now(),"running",details("delta",item.delta(),"item",item.item())));}return completed==null?new ModelResponse(new Message("assistant",text.toString())):completed; }
    }
	public StreamResult stream(RunOptions options){StreamResult stream=new StreamResult();Consumer<AgentEvent> original=options.onEvent();Consumer<AgentEvent> handler=item->{stream.push(item);if(original!=null)original.accept(item);};ModelClient client=options.client() instanceof StreamingModelClient streaming?new StreamingAdapter(streaming,handler):options.client();Thread worker=new Thread(()->{try{stream.complete(run(new RunOptions(options.input(),client,options.context(),options.model(),options.preset(),options.maxSteps(),options.modelRetry(),options.toolExecution(),handler,options.devtools(),options.state())),null);}catch(Throwable error){stream.complete(null,error);}},"phaseo-agent-stream");stream.worker=worker;worker.setDaemon(true);worker.start();return stream;}

    public RunResult continueRun(ContinueOptions options) throws Exception {
      RunResult sourceResult=options.run()!=null?options.run():(options.state()!=null&&options.runId()!=null?options.state().load(options.runId()):null);if(sourceResult==null)throw new IllegalArgumentException("A run or state accessor with runId is required");RunRecord source = sourceResult.run();
      if (!source.agentId().equals(definition.id())) throw new IllegalArgumentException("Run belongs to " + source.agentId());
      if (source.status().equals("waiting_for_human") && (options.humanInput() == null || options.humanInput().isBlank()) && (source.pause() == null || source.pause().pendingToolCalls().isEmpty())) throw new IllegalArgumentException("Run is waiting for human input");
      Instant started = Instant.now();
      List<Message> messages = new ArrayList<>(source.messages());
	  Object[] resumedContext={source.context()}; NextTurnParams[] resumedNext={source.nextTurn()};
      if (options.humanInput() != null && !options.humanInput().isBlank()) messages.add(new Message("user", options.humanInput()));
      else if (source.pause() != null && !source.pause().pendingToolCalls().isEmpty()) {
        Map<String,ToolDecision> approved = new LinkedHashMap<>(), rejected = new LinkedHashMap<>(); Map<String,Object> outputs = new LinkedHashMap<>(); Map<String,Tool> tools = new LinkedHashMap<>();
        options.approvals().forEach(item -> approved.put(item.toolCallId(), item)); options.rejections().forEach(item -> rejected.put(item.toolCallId(), item)); options.toolOutputs().forEach(item -> outputs.put(item.toolCallId(), item.output())); definition.tools().forEach(item -> tools.put(item.id(), item));
        for (PendingToolCall pending : source.pause().pendingToolCalls()) {
		  Tool tool = tools.get(pending.call().name()); RuntimeContext runtime = new RuntimeContext(source.id(), source.agentId(), source.stepCount()-1, resumedContext[0], pending.call(), null, value->resumedContext[0]=value); Object value;
          if (rejected.containsKey(pending.call().id())) { messages.add(new Message("tool", stringify(Map.of("error", first(rejected.get(pending.call().id()).reason(), "Tool call rejected"))), List.of(), pending.call().id(), tool.id())); continue; }
		  if (pending.kind().equals("approval")) { if (!approved.containsKey(pending.call().id())) throw new IllegalArgumentException("Missing approval decision for tool call " + pending.call().id()); ToolExecutionOutcome outcome=executeTool(tools,pending.call(),withContext(source,resumedContext[0]),source.stepCount()-1,options.onEvent());messages.add(outcome.message());if(outcome.contextWasSet())resumedContext[0]=outcome.context();if(tool.nextTurnParams()!=null)resumedNext[0]=tool.nextTurnParams();continue; }
          else { if (!outputs.containsKey(pending.call().id())) throw new IllegalArgumentException("Missing output for tool call " + pending.call().id()); value = outputs.get(pending.call().id()); if (tool.onResponseReceived() != null) value = tool.onResponseReceived().receive(value, runtime); }
          value = validate(tool.outputSchema(), value, "tool output"); messages.add(new Message("tool", stringify(value), List.of(), pending.call().id(), tool.id()));
		  if(tool.nextTurnParams()!=null)resumedNext[0]=tool.nextTurnParams();
        }
      }
	  RunRecord run = withNext(withContext(copyRun(source, "running", messages, source.stepCount(), source.result(), source.error(), null),resumedContext[0]),resumedNext[0]);
      emit(options.onEvent(), "run.resumed", run, Map.of("previous_status", source.status()));
      try {
        RunResult result = execute(run, new ArrayList<>(sourceResult.steps()), options.client(), options.context() == null ? source.context() : options.context(), options.model(), options.preset(), options.maxSteps(), options.modelRetry(), options.toolExecution(), options.onEvent());if(options.state()!=null)options.state().save(result);
        capture(result, "agent.continue", started, options.devtools(), null, run.id());
        return result;
      } catch (Exception error) {
        capture(null, "agent.continue", started, options.devtools(), error, run.id());
        throw error;
      }
    }

	public StreamResult continueStream(ContinueOptions options){StreamResult stream=new StreamResult();Consumer<AgentEvent> original=options.onEvent(),handler=event->{stream.push(event);if(original!=null)original.accept(event);};ModelClient client=options.client() instanceof StreamingModelClient streaming?new StreamingAdapter(streaming,handler):options.client();ContinueOptions configured=new ContinueOptions(options.run(),client,options.context(),options.model(),options.preset(),options.maxSteps(),options.humanInput(),options.modelRetry(),options.toolExecution(),handler,options.devtools(),options.approvals(),options.rejections(),options.toolOutputs(),options.runId(),options.state());Thread worker=new Thread(()->{try{stream.complete(continueRun(configured),null);}catch(Throwable error){stream.complete(null,error);}},"phaseo-agent-continue-stream");stream.worker=worker;worker.setDaemon(true);worker.start();return stream;}

    private RunResult execute(RunRecord initial, List<RunStep> steps, ModelClient client, Object context, String model, String preset, Integer maxStepsOverride, ModelRetryConfig retryOverride, ToolExecutionConfig executionOverride, Consumer<AgentEvent> handler) throws Exception {
      RunRecord run = copyRun(initial, "running", initial.messages(), initial.stepCount(), initial.result(), initial.error(), initial.pause());
      int maxSteps = maxStepsOverride != null && maxStepsOverride > 0 ? maxStepsOverride : definition.maxSteps();
      ModelRetryConfig retry = retryOverride == null ? definition.modelRetry() : retryOverride;
      ToolExecutionConfig execution = executionOverride == null ? definition.toolExecution() : executionOverride;
      String targetModel = first(model, presetAlias(preset), definition.model(), presetAlias(definition.preset()));
      Map<String, Tool> tools = new LinkedHashMap<>();
      definition.tools().forEach(tool -> tools.put(tool.id(), tool));
      NextTurnParams nextTurn = run.nextTurn(); run=withNext(run,null);
      Instant loopStarted=Instant.now();

      for (int index = run.stepCount(); index < maxSteps; index++) {
        TurnContext turn=new TurnContext(index+1,index,List.copyOf(run.messages()),run.context(),null);String turnModel=definition.dynamicModel()==null?targetModel:definition.dynamicModel().apply(turn);String turnInstructions=definition.dynamicInstructions()==null?definition.instructions():definition.dynamicInstructions().apply(turn);Double temperature=definition.temperature()==null?null:definition.temperature().apply(turn),topP=definition.topP()==null?null:definition.topP().apply(turn);Integer maxOutput=definition.maxOutputTokens()==null?null:definition.maxOutputTokens().apply(turn);List<Tool> turnTools=definition.dynamicTools()==null?definition.tools():definition.dynamicTools().apply(turn);
        if(nextTurn!=null){turnModel=nextTurn.model()==null?turnModel:nextTurn.model();turnInstructions=nextTurn.instructions()==null?turnInstructions:nextTurn.instructions();temperature=nextTurn.temperature()==null?temperature:nextTurn.temperature();maxOutput=nextTurn.maxOutputTokens()==null?maxOutput:nextTurn.maxOutputTokens();topP=nextTurn.topP()==null?topP:nextTurn.topP();turnTools=nextTurn.tools()==null?turnTools:nextTurn.tools();nextTurn=null;}tools.clear();turnTools.forEach(tool->tools.put(tool.id(),tool));
        RunStep step = new RunStep(index, "executing_model", List.of(), null, null, null, targetModel, 0, null, null, null);
        steps.add(step);
        emit(handler, "step.started", run, Map.of("step_index", index));
        ModelResponse response = null;
        for (int attempt = 0; attempt <= Math.max(0, retry.maxRetries()); attempt++) {
          step = new RunStep(index, step.status(), step.toolCalls(), step.requestId(), step.nativeResponseId(), step.provider(), step.model(), attempt + 1, step.usage(), step.responseMeta(), step.error());
          steps.set(steps.size() - 1, step);
          emit(handler, "model.requested", run, details("step_index", index, "attempt", attempt + 1, "model", turnModel));
          try { response = client.generate(new ModelRequest(definition.id(), run.messages(), turnTools, turnModel, turnInstructions, run.context(),temperature,maxOutput,topP)); break; }
          catch (Exception error) {
            if (attempt >= retry.maxRetries()) throw error;
            Thread.sleep(Math.max(0, retry.backoff().toMillis()) * (attempt + 1));
          }
        }
        if (response == null) throw new IllegalStateException("Model client returned no response");
        List<Message> messages = new ArrayList<>(run.messages()); messages.add(response.message());
        run = copyRun(run, run.status(), messages, index + 1, run.result(), run.error(), run.pause());
        UsageSummary currentUsage = usage(response), previousUsage = run.usage();
        run = new RunRecord(run.id(),run.agentId(),run.status(),run.input(),run.context(),run.messages(),run.stepCount(),run.result(),run.error(),run.pause(),run.createdAt(),run.updatedAt(),run.stopReason(),new UsageSummary(previousUsage.inputTokens()+currentUsage.inputTokens(),previousUsage.outputTokens()+currentUsage.outputTokens(),previousUsage.cachedTokens()+currentUsage.cachedTokens(),previousUsage.totalTokens()+currentUsage.totalTokens(),previousUsage.cost()+currentUsage.cost()),run.nextTurn());
        step = new RunStep(index, step.status(), response.message().toolCalls() == null ? List.of() : response.message().toolCalls(), response.requestId(), response.nativeResponseId(), response.provider(), first(response.model(), turnModel), step.modelAttempts(), response.usage(), response.responseMeta(), null,response.finishReason(),response.warnings());
        steps.set(steps.size() - 1, step);
        emit(handler, "model.completed", run, details("step_index", index, "attempt", step.modelAttempts(), "request_id", step.requestId(), "model", step.model()));
        Object parsed = step.toolCalls().isEmpty() && definition.parseOutput() != null ? definition.parseOutput().apply(response.message().content()) : null;
        if (definition.humanReview() != null) {
          HumanReviewRequest review = definition.humanReview().review(new HumanReviewContext(run.id(), run.agentId(), index, run.input(), context, List.copyOf(run.messages()), response, parsed));
          if (review != null) {
            HumanPause pause = new HumanPause(review.reason(), review.payload(), now());
            run = copyRun(run, "waiting_for_human", run.messages(), run.stepCount(), run.result(), run.error(), pause);
            steps.set(steps.size() - 1, withStatus(step, "checkpointed"));
            emit(handler, "checkpoint.saved", run, Map.of("step_index", index));
            emit(handler, "run.waiting_for_human", run, details("step_index", index, "pause", pause));
            return new RunResult(run, List.copyOf(steps), null, run.messages());
          }
        }
        if (step.toolCalls().isEmpty()) {
          Object output = definition.parseOutput() == null ? response.message().content() : parsed;
          output = validate(definition.outputSchema(), output, "agent output");
          for (StopCondition condition : definition.stopWhen()) { String reason = condition.shouldStop(new StopState(run.stepCount(),run.usage(),step.toolCalls(),response.finishReason(),Duration.between(loopStarted,Instant.now()))); if (reason != null) { run = new RunRecord(run.id(),run.agentId(),"stopped",run.input(),run.context(),run.messages(),run.stepCount(),output,null,null,run.createdAt(),now(),reason,run.usage(),null); return new RunResult(run,List.copyOf(steps),output,run.messages()); } }
          run = copyRun(run, "completed", run.messages(), run.stepCount(), output, null, null);
          steps.set(steps.size() - 1, withStatus(step, "checkpointed"));
          emit(handler, "checkpoint.saved", run, Map.of("step_index", index));
          emit(handler, "run.completed", run, details("output", output));
          return new RunResult(run, List.copyOf(steps), output, run.messages());
        }
        run = copyRun(run, "waiting_for_tools", run.messages(), run.stepCount(), run.result(), run.error(), run.pause());
        steps.set(steps.size() - 1, withStatus(step, "executing_tools"));
        List<ToolCall> automatic = new ArrayList<>(); List<PendingToolCall> pending = new ArrayList<>(); List<Message> prefetchedMessages = new ArrayList<>();
        for (ToolCall original : step.toolCalls()) {
          Tool tool = tools.get(original.name()); if (tool == null) throw new IllegalArgumentException("Unknown tool '" + original.name() + "'");
          ToolCall call = new ToolCall(original.id(), original.name(), validate(tool.inputSchema(), original.input(), "tool input")); RuntimeContext runtime = new RuntimeContext(run.id(),run.agentId(),index,run.context(),call,null,null);
          if (tool.onToolCalled() != null) { ToolCalledResult result = tool.onToolCalled().call(call.input(),runtime); if (!result.completed()) pending.add(new PendingToolCall(call,"hitl","Tool requires human input")); else prefetchedMessages.add(new Message("tool",stringify(validate(tool.outputSchema(),result.output(),"tool output")),List.of(),call.id(),tool.id())); continue; }
          boolean gated = tool.requireApproval(); if (tool.approval()!=null) gated=tool.approval().approve(call.input(),runtime); if(definition.requireApproval()!=null) gated=definition.requireApproval().approve(call,runtime);
          if(gated) pending.add(new PendingToolCall(call,"approval","Tool requires approval")); else if(tool.execute()==null) pending.add(new PendingToolCall(call,"manual","Tool requires external output")); else automatic.add(call);
        }
        final RunRecord activeRun = run;
        final int stepIndex = index;
        ExecutorService pool = Executors.newFixedThreadPool(Math.max(1, execution.concurrency()));
        try {
		  List<Callable<ToolExecutionOutcome>> tasks = automatic.stream().map(call -> (Callable<ToolExecutionOutcome>) () -> executeTool(tools, call, activeRun, stepIndex, handler)).toList();
		  List<Future<ToolExecutionOutcome>> futures = new ArrayList<>();
		  for (Callable<ToolExecutionOutcome> task : tasks) futures.add(pool.submit(task));
          messages = new ArrayList<>(run.messages());
          messages.addAll(prefetchedMessages);
		  for (Future<ToolExecutionOutcome> future : futures) {ToolExecutionOutcome outcome=future.get();messages.add(outcome.message());if(outcome.contextWasSet())run=withContext(run,outcome.context());}
          run = copyRun(run, run.status(), messages, run.stepCount(), run.result(), run.error(), run.pause());
        } finally { pool.shutdownNow(); }
        for(ToolCall call:automatic){Tool configured=tools.get(call.name());if(configured.nextTurnParams()!=null)nextTurn=configured.nextTurnParams();}
        if (!pending.isEmpty()) { HumanPause pause = new HumanPause("Pending tool calls require input",pending,now(),pending.stream().anyMatch(item -> item.kind().equals("approval")) ? "tool_approval" : pending.get(0).kind(),List.copyOf(pending)); run=withNext(copyRun(run,"waiting_for_human",run.messages(),run.stepCount(),run.result(),run.error(),pause),nextTurn); steps.set(steps.size()-1,withStatus(steps.get(steps.size()-1),"checkpointed")); emit(handler,"run.waiting_for_human",run,details("step_index",index,"pause",pause)); return new RunResult(run,List.copyOf(steps),null,run.messages()); }
        for(StopCondition condition:definition.stopWhen()){String reason=condition.shouldStop(new StopState(run.stepCount(),run.usage(),step.toolCalls(),response.finishReason(),Duration.between(loopStarted,Instant.now())));if(reason!=null){run=new RunRecord(run.id(),run.agentId(),"stopped",run.input(),run.context(),run.messages(),run.stepCount(),response.message().content(),null,null,run.createdAt(),now(),reason,run.usage(),null);return new RunResult(run,List.copyOf(steps),run.result(),run.messages());}}
        steps.set(steps.size() - 1, withStatus(steps.get(steps.size() - 1), "checkpointed"));
        emit(handler, "checkpoint.saved", run, Map.of("step_index", index));
      }
      run = copyRun(run, "failed", run.messages(), run.stepCount(), null, "Max steps exceeded (" + maxSteps + ")", run.pause());
      emit(handler, "run.failed", run, Map.of("error", run.error()));
      throw new IllegalStateException(run.error());
    }

	private record ToolExecutionOutcome(Message message,Object context,boolean contextWasSet){}
	private ToolExecutionOutcome executeTool(Map<String, Tool> tools, ToolCall call, RunRecord run, int index, Consumer<AgentEvent> handler) throws Exception {
      Tool tool = tools.get(call.name());
      if (tool == null) throw new IllegalArgumentException("Unknown tool '" + call.name() + "'");
      emit(handler, "tool.started", run, details("step_index", index, "tool_call_id", call.id(), "tool_name", call.name()));
      Object output;
      ToolResponse progress = (value, ignored) -> { Object checked=validate(tool.eventSchema(),value,"tool progress event"); emit(handler,"tool.preliminary_result",run,details("step_index",index,"tool_call_id",call.id(),"tool_name",call.name(),"result",checked)); return checked; };
	  Object[] context={run.context()};boolean[] contextWasSet={false};RuntimeContext runtime = new RuntimeContext(run.id(),run.agentId(),index,context[0],call,progress,value->{context[0]=value;contextWasSet[0]=true;});
      try { if (tool.timeout() == null) output = tool.execute().execute(call.input(), runtime);
      else {
        ExecutorService timeoutPool = Executors.newSingleThreadExecutor();
        try { output = timeoutPool.submit(() -> tool.execute().execute(call.input(), runtime)).get(tool.timeout().toMillis(), TimeUnit.MILLISECONDS); }
        finally { timeoutPool.shutdownNow(); }
      } output=validate(tool.outputSchema(),output,"tool output"); }
	  catch(Exception error) { if(!"return-to-model".equals(tool.onError())) throw error; emit(handler,"tool.failed",run,details("tool_call_id",call.id(),"tool_name",call.name(),"error",error.getMessage())); return new ToolExecutionOutcome(new Message("tool",stringify(Map.of("error",error.getMessage())),List.of(),call.id(),tool.id()),context[0],contextWasSet[0]); }
      emit(handler, "tool.completed", run, details("step_index", index, "tool_call_id", call.id(), "tool_name", call.name(), "output", output));
	  return new ToolExecutionOutcome(new Message("tool", stringify(output), List.of(), call.id(), tool.id()),context[0],contextWasSet[0]);
    }

    private void capture(RunResult result, String operation, Instant started, DevtoolsConfig config, Exception error, String runId) {
      boolean enabled = config != null ? config.enabled() : "true".equalsIgnoreCase(System.getenv("PHASEO_DEVTOOLS"));
      if (!enabled) return;
      String directory = config != null ? config.directory() : first(System.getenv("PHASEO_DEVTOOLS_DIR"), ".phaseo-devtools");
      try {
        for (String kind : List.of("images", "audio", "video")) Files.createDirectories(Path.of(directory, "assets", kind));
        Path metadataPath = Path.of(directory, "metadata.json");
        if (!Files.exists(metadataPath)) JSON.writeValue(metadataPath.toFile(), Map.of("session_id", UUID.randomUUID().toString(), "started_at", started.toEpochMilli(), "sdk", "java"));
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", result == null ? runId : result.run().id()); entry.put("type", operation); entry.put("timestamp", started.toEpochMilli());
        entry.put("request", Map.of("agent_id", definition.id(), "tool_count", definition.tools().size())); entry.put("response", result);
        Map<String, Object> metadata = new LinkedHashMap<>(Map.of("sdk", "java", "agent_id", definition.id(), "run_id", runId));
        Map<String, Object> errorInfo = null;
        if (error != null) {
          errorInfo = new LinkedHashMap<>();
          errorInfo.put("message", error.getMessage());
          errorInfo.put("type", error.getClass().getName());
          if (error instanceof ApiException apiError) {
            Map<String, Object> values = new LinkedHashMap<>();
            values.put("status_code", apiError.getStatusCode());
            values.put("request_id", readApiErrorProperty(apiError, "getRequestId"));
            values.put("generation_id", readApiErrorProperty(apiError, "getGenerationId"));
            values.put("code", readApiErrorProperty(apiError, "getCode"));
            values.put("error_type", readApiErrorProperty(apiError, "getErrorType"));
            values.put("error_origin", readApiErrorProperty(apiError, "getErrorOrigin"));
            values.put("retryable", readApiErrorProperty(apiError, "getRetryable"));
            values.put("action", readApiErrorProperty(apiError, "getAction"));
            values.put("docs_url", readApiErrorProperty(apiError, "getDocsUrl"));
            values.put("support_url", readApiErrorProperty(apiError, "getSupportUrl"));
            values.put("retry_after_seconds", readApiErrorProperty(apiError, "getRetryAfterSeconds"));
            values.put("details", readApiErrorProperty(apiError, "getDetails"));
            values.entrySet().removeIf(item -> item.getValue() == null);
            errorInfo.putAll(values);
            metadata.putAll(values);
          }
        }
        entry.put("error", errorInfo); entry.put("metadata", metadata);
        Files.writeString(Path.of(directory, "generations.jsonl"), JSON.writeValueAsString(entry) + System.lineSeparator(), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
      } catch (IOException ignored) { }
    }

    private static Object readApiErrorProperty(ApiException error, String method) {
      try { return error.getClass().getMethod(method).invoke(error); }
      catch (ReflectiveOperationException ignored) { return null; }
    }
  }

  private static RunRecord copyRun(RunRecord run, String status, List<Message> messages, int steps, Object result, String error, HumanPause pause) { return new RunRecord(run.id(), run.agentId(), status, run.input(), run.context(), List.copyOf(messages), steps, result, error, pause, run.createdAt(), now(), run.stopReason(), run.usage(),run.nextTurn()); }
  private static RunRecord withNext(RunRecord run,NextTurnParams next){return new RunRecord(run.id(),run.agentId(),run.status(),run.input(),run.context(),run.messages(),run.stepCount(),run.result(),run.error(),run.pause(),run.createdAt(),run.updatedAt(),run.stopReason(),run.usage(),next);}
	private static RunRecord withContext(RunRecord run,Object context){return new RunRecord(run.id(),run.agentId(),run.status(),run.input(),context,run.messages(),run.stepCount(),run.result(),run.error(),run.pause(),run.createdAt(),run.updatedAt(),run.stopReason(),run.usage(),run.nextTurn());}
  private static RunStep withStatus(RunStep step, String status) { return new RunStep(step.index(), status, step.toolCalls(), step.requestId(), step.nativeResponseId(), step.provider(), step.model(), step.modelAttempts(), step.usage(), step.responseMeta(), step.error(),step.finishReason(),step.warnings()); }
  private static void emit(Consumer<AgentEvent> handler, String type, RunRecord run, Map<String, Object> details) { if (handler != null) handler.accept(new AgentEvent(type, run.id(), run.agentId(), now(), run.status(), details)); }
  private static String now() { return Instant.now().toString(); }
  private static String stringify(Object value) { if (value == null) return ""; if (value instanceof String text) return text; try { return JSON.writeValueAsString(value); } catch (Exception ignored) { return String.valueOf(value); } }
  private static Object validate(Validator schema, Object value, String label) throws Exception { if (schema == null) return value; try { return schema.validate(value); } catch (Exception error) { throw new IllegalArgumentException("Invalid " + label + ": " + error.getMessage(), error); } }
  private static UsageSummary usage(ModelResponse response) {
    Function<List<String>,Integer> read = keys -> { for (String key : keys) { Object value = response.usage() == null ? null : response.usage().get(key); if (value instanceof Number number) return number.intValue(); } return 0; };
    int input=read.apply(List.of("input_tokens","prompt_tokens")), output=read.apply(List.of("output_tokens","completion_tokens")), total=read.apply(List.of("total_tokens")); if(total==0) total=input+output;
    return new UsageSummary(input,output,read.apply(List.of("cached_tokens","cache_read_input_tokens")),total,response.cost());
  }
  private static String presetAlias(String value) { if (value == null) return null; String normalized = value.trim().replaceFirst("^@+", ""); return normalized.isEmpty() ? null : "@" + normalized; }
  private static String first(String... values) { for (String value : values) if (value != null && !value.isBlank()) return value.trim(); return null; }
  private static Map<String, Object> details(Object... values) { Map<String, Object> map = new LinkedHashMap<>(); for (int i = 0; i < values.length; i += 2) if (values[i + 1] != null) map.put(String.valueOf(values[i]), values[i + 1]); return map; }
  private static String text(JsonNode node, String key) { JsonNode value = node == null ? null : node.get(key); return value == null || value.isNull() ? null : value.asText(); }
  private static Map<String, Object> mapValue(JsonNode node) { return node == null || !node.isObject() ? null : JSON.convertValue(node, new TypeReference<>() {}); }
  private static List<ToolCall> toolCalls(JsonNode response) { List<ToolCall> calls = new ArrayList<>(); JsonNode items = response.has("output_items") ? response.get("output_items") : response.get("output"); if (items != null && items.isArray()) for (JsonNode item : items) if ("function_call".equalsIgnoreCase(text(item, "type"))) { Object input; try { input = JSON.readValue(text(item, "arguments"), Object.class); } catch (Exception error) { input = Map.of("raw", text(item, "arguments")); } calls.add(new ToolCall(first(text(item, "call_id"), UUID.randomUUID().toString()), first(text(item, "name"), "tool"), input)); } return List.copyOf(calls); }
  private static String assistantText(JsonNode response) { List<String> parts = new ArrayList<>(); JsonNode items = response.has("output_items") ? response.get("output_items") : response.get("output"); if (items != null && items.isArray()) for (JsonNode item : items) if ("message".equalsIgnoreCase(text(item, "type")) && item.path("content").isArray()) for (JsonNode part : item.path("content")) if ("output_text".equalsIgnoreCase(text(part, "type"))) parts.add(text(part, "text")); return String.join("\n\n", parts); }
  private static List<Map<String, Object>> toResponsesInput(List<Message> messages) { List<Map<String, Object>> items = new ArrayList<>(); for (Message message : messages) { if ("system".equals(message.role())) continue; Map<String, Object> item = new LinkedHashMap<>(); if ("tool".equals(message.role())) { item.put("type", "function_call_output"); item.put("call_id", message.toolCallId()); item.put("output", message.content()); } else { item.put("type", "message"); item.put("role", message.role()); item.put("content", message.content()); if ("assistant".equals(message.role()) && message.toolCalls() != null && !message.toolCalls().isEmpty()) item.put("tool_calls", message.toolCalls().stream().map(call -> Map.of("id", call.id(), "type", "function", "function", Map.of("name", call.name(), "arguments", stringify(call.input())))).toList()); } items.add(item); } return items; }
  private static String toInstructions(List<Message> messages, String override) { List<String> system = messages.stream().filter(message -> "system".equals(message.role()) && !message.content().isBlank()).map(Message::content).toList(); String joined = String.join("\n\n", system); if (override != null && !joined.isBlank()) return override + "\n\n" + joined; return first(override, joined); }
}
