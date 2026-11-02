package app.phaseo.agent;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class AgentSdkTest {
  @Test
  void executesToolLoop() throws Exception {
    AtomicInteger turns = new AtomicInteger();
    AgentSdk.ModelClient client = request -> turns.getAndIncrement() == 0
      ? new AgentSdk.ModelResponse(new AgentSdk.Message("assistant", "", List.of(new AgentSdk.ToolCall("call_1", "lookup", Map.of("slug", "presets"))), null, null))
      : new AgentSdk.ModelResponse(new AgentSdk.Message("assistant", "Presets define stable routing defaults."));
    var tool = AgentSdk.defineTool(new AgentSdk.Tool("lookup", (input, context) -> Map.of("ok", true), "Lookup docs", Map.of("type", "object"), null));
    var agent = AgentSdk.createAgent(new AgentSdk.AgentDefinition("support-agent", null, null, "Use tools.", List.of(tool), 12, null, null, null, null));
    var result = agent.run(new AgentSdk.RunOptions("Explain presets", client, null, null, null, null, null, null, null, null));
    assertEquals("completed", result.run().status());
    assertEquals(2, result.steps().size());
    assertEquals("tool", result.messages().get(result.messages().size() - 2).role());
  }

  @Test
  void retriesPausesResumesEmitsEventsAndCapturesDevtools() throws Exception {
    AtomicInteger turns = new AtomicInteger();
    AgentSdk.ModelClient client = request -> {
      if (turns.getAndIncrement() == 0) throw new IllegalStateException("temporary gateway failure");
      return new AgentSdk.ModelResponse(new AgentSdk.Message("assistant", "Deploy the change"));
    };
    List<AgentSdk.AgentEvent> events = new ArrayList<>();
    var agent = AgentSdk.createAgent(new AgentSdk.AgentDefinition(
      "review-agent", null, null, null, List.of(), 12, null,
      context -> context.messages().stream().anyMatch(message -> message.role().equals("user") && message.content().equals("approved"))
        ? null : new AgentSdk.HumanReviewRequest("Approve deployment", context.response().message().content()),
      new AgentSdk.ModelRetryConfig(1, Duration.ZERO), null
    ));
    var directory = Files.createTempDirectory("phaseo-agent-");
    var devtools = AgentSdk.createAgentDevtools(directory.toString());
    var paused = agent.run(new AgentSdk.RunOptions("Prepare deployment", client, null, null, null, null, null, null, events::add, devtools));
    assertEquals("waiting_for_human", paused.run().status());
    assertEquals(2, paused.steps().get(0).modelAttempts());
    var resumed = agent.continueRun(new AgentSdk.ContinueOptions(paused, client, null, null, null, null, "approved", null, null, events::add, devtools));
    assertEquals("completed", resumed.run().status());
    assertEquals("Deploy the change", resumed.output());
    assertEquals(2, Files.readAllLines(directory.resolve("generations.jsonl")).size());
    assertTrue(events.stream().anyMatch(event -> event.type().equals("run.resumed")));
  }

  @Test
  void advancedParityUsesExactCallDecisions() throws Exception {
    AtomicInteger turns = new AtomicInteger(); List<String> executed = new ArrayList<>(); List<AgentSdk.AgentEvent> events = new ArrayList<>();
    AgentSdk.ModelClient client = request -> turns.getAndIncrement() == 0
      ? new AgentSdk.ModelResponse(new AgentSdk.Message("assistant", "", List.of(
          new AgentSdk.ToolCall("auto","progress",Map.of("value",2)), new AgentSdk.ToolCall("gate","gated",Map.of()),
          new AgentSdk.ToolCall("manual","manual",Map.of()), new AgentSdk.ToolCall("failure","failure",Map.of())), null, null),
          Map.of("input_tokens",2,"output_tokens",1),null,null,null,null,null,null,1,List.of())
      : new AgentSdk.ModelResponse(new AgentSdk.Message("assistant","done"),null,null,null,null,null,null,null,1,List.of());
    var progress = new AgentSdk.Tool("progress", (input, runtime) -> { runtime.emitProgress().receive(Map.of("percent",50),runtime); executed.add("auto"); return Map.of("result",4); },null,null,null,value->value,value->value,null,false,null,null,null,"fail-run");
    var gated = new AgentSdk.Tool("gated", (input, runtime) -> { executed.add("gate"); return "approved"; },null,null,null,null,null,null,true,null,null,null,"fail-run");
    var manual = new AgentSdk.Tool("manual",null);
    var failure = new AgentSdk.Tool("failure",(input,runtime)->{throw new IllegalStateException("expected");},null,null,null,null,null,null,false,null,null,null,"return-to-model");
    var agent = AgentSdk.createAgent(new AgentSdk.AgentDefinition("advanced",null,null,null,List.of(progress,gated,manual,failure),12,null,null,null,null,
      List.of(state -> state.usage().cost() >= 2 ? "max_cost:2" : null),null,null));
    var paused = agent.run(new AgentSdk.RunOptions("run",client,null,null,null,null,null,null,events::add,null));
    assertEquals(List.of("gate","manual"),paused.run().pause().pendingToolCalls().stream().map(item->item.call().id()).toList());
    var result = agent.continueRun(new AgentSdk.ContinueOptions(paused,client,null,null,null,null,null,null,null,null,null,List.of(new AgentSdk.ToolDecision("gate")),List.of(),List.of(new AgentSdk.ToolOutput("manual","external"))));
    assertEquals("stopped",result.run().status()); assertEquals(2,result.usage().cost()); assertEquals(List.of("auto","gate"),executed);
    assertTrue(events.stream().anyMatch(event -> event.type().equals("tool.preliminary_result")));
  }

  @Test
  void streamIsReplayableAndStateIsApplicationOwned() {
    class Client implements AgentSdk.StreamingModelClient {
      public AgentSdk.ModelResponse generate(AgentSdk.ModelRequest request){return new AgentSdk.ModelResponse(new AgentSdk.Message("assistant","fallback"));}
      public Iterable<AgentSdk.ModelStreamEvent> stream(AgentSdk.ModelRequest request){return List.of(new AgentSdk.ModelStreamEvent("response.output_text.delta","hel",null,null),new AgentSdk.ModelStreamEvent("response.output_text.delta","lo",null,null),new AgentSdk.ModelStreamEvent("response.completed",null,null,new AgentSdk.ModelResponse(new AgentSdk.Message("assistant","hello"))));}
    }
    class State implements AgentSdk.StateAccessor { AgentSdk.RunResult value; public AgentSdk.RunResult load(String id){return value;} public void save(AgentSdk.RunResult result){value=result;} }
    State state=new State();var stream=AgentSdk.createAgent(new AgentSdk.AgentDefinition("stream",null,null,null,List.of(),12,null,null,null,null)).stream(new AgentSdk.RunOptions("run",new Client(),null,null,null,null,null,null,null,null,state));
    assertEquals(List.of("hel","lo"),stream.textStream());var result=stream.getResult();assertEquals(List.of("hel","lo"),stream.textStream());assertEquals("hello",result.output());assertNotNull(state.value);
  }

  @Test
  void gatewayClientSendsTheApiKeyProviderCredential() throws Exception {
    List<String> authorizations = new java.util.concurrent.CopyOnWriteArrayList<>();
    var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/responses", exchange -> {
      authorizations.add(exchange.getRequestHeaders().getFirst("Authorization"));
      byte[] bytes = "{\"id\":\"resp_1\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"ok\"}]}]}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
      exchange.getResponseHeaders().add("Content-Type", "application/json");
      exchange.sendResponseHeaders(200, bytes.length);
      try (var os = exchange.getResponseBody()) { os.write(bytes); }
    });
    server.createContext("/models", exchange -> {
      byte[] bytes = "{\"models\":[]}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(200, bytes.length);
      try (var os = exchange.getResponseBody()) { os.write(bytes); }
    });
    server.start();
    try {
      AtomicInteger calls = new AtomicInteger();
      String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
      var client = AgentSdk.createGatewayAgentClient(new AgentSdk.GatewayOptions(null, null, baseUrl, "openai/gpt-5.4-nano", null, null, () -> "workload-token-" + calls.incrementAndGet()));
      var response = client.generate(new AgentSdk.ModelRequest("agent", List.of(new AgentSdk.Message("user", "hi")), List.of(), null, null, null));
      assertEquals("ok", response.message().content());
      // Call 1 is the model lifecycle lookup on /models; the Responses request gets a fresh credential.
      assertEquals(List.of("Bearer workload-token-2"), authorizations);
    } finally {
      server.stop(0);
    }
  }
}

class LiveGatewayTest {
  @org.junit.jupiter.api.Test void streamsLunaWhenEnabled() throws Exception {
    if(!"true".equals(System.getenv("PHASEO_AGENT_LIVE_SMOKE"))||System.getenv("PHASEO_API_KEY")==null)return;
    var client=AgentSdk.createGatewayAgentClient(new AgentSdk.GatewayOptions(null,null,null,"openai/gpt-5.6-luna",null,null));boolean delta=false,completed=false;
    for(var event:client.stream(new AgentSdk.ModelRequest("live-smoke",List.of(new AgentSdk.Message("user","Reply with exactly: luna-ok")),List.of(),null,null,null))){if(event.type().equals("response.output_text.delta")&&event.delta()!=null&&!event.delta().isEmpty())delta=true;if(event.type().equals("response.completed")&&event.response()!=null)completed=true;}
    org.junit.jupiter.api.Assertions.assertTrue(delta);org.junit.jupiter.api.Assertions.assertTrue(completed);
  }
}
