<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/AgentSdk.php";

use Phaseo\AgentSdk\Agent;
use Phaseo\AgentSdk\AgentDefinition;
use Phaseo\AgentSdk\AgentSdk;
use Phaseo\AgentSdk\Message;
use Phaseo\AgentSdk\ModelClient;
use Phaseo\AgentSdk\ModelRequest;
use Phaseo\AgentSdk\ModelResponse;
use Phaseo\AgentSdk\RuntimeContext;
use Phaseo\AgentSdk\HumanReviewRequest;
use Phaseo\AgentSdk\Tool;
use Phaseo\AgentSdk\ToolCall;
use Phaseo\AgentSdk\ToolDecision;
use Phaseo\AgentSdk\ToolOutput;
use Phaseo\AgentSdk\StreamingModelClient;
use Phaseo\AgentSdk\StateAccessor;
use Phaseo\AgentSdk\RunResult;
use Phaseo\AgentSdk\GatewayAgentClientOptions;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeModelClient implements ModelClient
{
    private int $turn = 0;

    public function generate(ModelRequest $request): ModelResponse
    {
        if ($this->turn === 0) {
            $this->turn++;
            return new ModelResponse(
                message: new Message(
                    role: "assistant",
                    content: "",
                    toolCalls: [
                        new ToolCall(
                            id: "call_weather",
                            name: "get_weather",
                            input: ["city" => "London"]
                        ),
                    ]
                ),
                requestId: "req_tool"
            );
        }

        return new ModelResponse(
            message: new Message(
                role: "assistant",
                content: "Weather for London: Sunny."
            ),
            requestId: "req_final"
        );
    }
}

$tool = AgentSdk::defineTool(
    new Tool(
        id: "get_weather",
        description: "Look up weather by city",
        parameters: [
            "type" => "object",
            "properties" => ["city" => ["type" => "string"]],
            "required" => ["city"],
        ],
        execute: static function (mixed $input, RuntimeContext $context): array {
            assert_true(($input["city"] ?? null) === "London", "expected tool input to be parsed");
            assert_true($context->stepIndex === 0, "expected runtime context step index");
            return ["city" => "London", "weather" => "Sunny"];
        }
    )
);

$agent = AgentSdk::createAgent(
    new AgentDefinition(
        id: "weather-agent",
        model: "openai/gpt-5.4-nano",
        instructions: "Use tools when helpful.",
        tools: [$tool]
    )
);

$result = $agent->run(
    input: "What is the weather in London?",
    client: new FakeModelClient()
);

assert_true($result->run->status === "completed", "expected completed status");
assert_true($result->run->stepCount === 2, "expected two steps");
assert_true($result->output === "Weather for London: Sunny.", "expected final output");
assert_true(count($result->messages) === 5, "expected system, user, assistant, tool, assistant sequence");
assert_true($result->steps[0]->requestId === "req_tool", "expected first request id");
assert_true($result->steps[1]->requestId === "req_final", "expected second request id");

echo "php agent sdk tests ok" . PHP_EOL;

$reviewClient = new class implements ModelClient {
    public int $calls = 0;
    public function generate(ModelRequest $request): ModelResponse
    {
        $this->calls++;
        if ($this->calls === 1) { throw new RuntimeException("temporary gateway failure"); }
        return new ModelResponse(message: new Message(role: "assistant", content: "Deploy the change"));
    }
};
$events = [];
$reviewAgent = AgentSdk::createAgent(new AgentDefinition(
    id: "review-agent",
    modelRetry: ["max_retries" => 1, "backoff_ms" => 0],
    humanReview: static function ($context): ?HumanReviewRequest {
        foreach ($context->messages as $message) {
            if ($message->role === "user" && $message->content === "approved") { return null; }
        }
        return new HumanReviewRequest("Approve deployment", $context->response->message->content);
    }
));
$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . "phaseo-agent-" . bin2hex(random_bytes(5));
$devtools = AgentSdk::createAgentDevtools($directory);
$handler = static function (array $event) use (&$events): void { $events[] = $event; };
$paused = $reviewAgent->run("Prepare deployment", $reviewClient, onEvent: $handler, devtools: $devtools);
assert_true($paused->run->status === "waiting_for_human", "expected human review pause");
assert_true($paused->steps[0]->modelAttempts === 2, "expected model retry");
$resumed = $reviewAgent->continueRun($paused, $reviewClient, humanInput: "approved", onEvent: $handler, devtools: $devtools);
assert_true($resumed->run->status === "completed", "expected resumed run to complete");
assert_true(count(file($directory . DIRECTORY_SEPARATOR . "generations.jsonl")) === 2, "expected two devtools entries");
assert_true(in_array("run.resumed", array_column($events, "type"), true), "expected run.resumed event");

echo "php agent sdk advanced tests ok" . PHP_EOL;

$turn = 0; $executed = []; $parityEvents = [];
$parityClient = new class($turn) implements ModelClient {
    public int $turn = 0;
    public function __construct(int $turn) { $this->turn = $turn; }
    public function generate(ModelRequest $request): ModelResponse {
        if ($this->turn++ === 0) return new ModelResponse(new Message("assistant", "", [
            new ToolCall("auto","progress",["value"=>2]), new ToolCall("gate","gated",[]),
            new ToolCall("manual","manual",[]), new ToolCall("failure","failure",[]),
        ]), usage:["input_tokens"=>2,"output_tokens"=>1], cost:1);
        return new ModelResponse(new Message("assistant","done"),cost:1);
    }
};
$parityAgent = AgentSdk::createAgent(new AgentDefinition(id:"parity",tools:[
    new Tool("progress",function($input,$runtime)use(&$executed){($runtime->emitProgress)(["percent"=>50]);$executed[]="auto";return ["result"=>4];},inputSchema:fn($value)=>$value,outputSchema:fn($value)=>$value),
    new Tool("gated",function()use(&$executed){$executed[]="gate";return "approved";},requireApproval:true),
    new Tool("manual",null), new Tool("failure",fn()=>throw new RuntimeException("expected"),onError:"return-to-model"),
],stopWhen:[fn($state)=>$state["usage"]["cost"]>=2?"max_cost:2":null]));
$parityHandler=function($event)use(&$parityEvents){$parityEvents[]=$event;};
$parityPaused=$parityAgent->run("run",$parityClient,onEvent:$parityHandler);
assert_true(array_map(fn($item)=>$item->call->id,$parityPaused->run->pause->pendingToolCalls)===["gate","manual"],"expected exact pending calls");
$parityResult=$parityAgent->continueRun($parityPaused,$parityClient,onEvent:$parityHandler,approvals:[new ToolDecision("gate")],toolOutputs:[new ToolOutput("manual","external")]);
assert_true($parityResult->run->status==="stopped"&&$parityResult->usage["cost"]===2.0,"expected usage stop");
assert_true($executed===["auto","gate"],"expected gated execution once");
assert_true(in_array("tool.preliminary_result",array_column($parityEvents,"type"),true),"expected progress event");
echo "php agent sdk parity tests ok" . PHP_EOL;

$streamClient=new class implements StreamingModelClient{
    public function generate(ModelRequest $request):ModelResponse{return new ModelResponse(new Message("assistant","fallback"));}
    public function stream(ModelRequest $request):iterable{yield ["type"=>"response.output_text.delta","delta"=>"hel"];yield ["type"=>"response.output_text.delta","delta"=>"lo"];yield ["type"=>"response.completed","response"=>new ModelResponse(new Message("assistant","hello"))];}
};
$memory=new class implements StateAccessor{public ?RunResult $value=null;public function load(string $runId):?RunResult{return $this->value;}public function save(RunResult $result):void{$this->value=$result;}};
$streamResult=AgentSdk::createAgent(new AgentDefinition(id:"stream"))->stream("run",$streamClient,state:$memory);
assert_true(implode("",iterator_to_array($streamResult->textStream()))==="hello","expected streamed text");assert_true(implode("",iterator_to_array($streamResult->textStream()))==="hello","expected replayed text");assert_true($streamResult->result->output==="hello"&&$memory->value!==null,"expected stream result state");
echo "php agent sdk stream tests ok" . PHP_EOL;

// A credential provider passed as api_key reaches the core client's requests.
$authLog = tempnam(sys_get_temp_dir(), "phaseo-agent-auth-");
$serverOut = $authLog . ".out";
$probe = stream_socket_server("tcp://127.0.0.1:0");
$probeName = (string) stream_socket_get_name($probe, false);
$port = (int) substr($probeName, strrpos($probeName, ":") + 1);
fclose($probe);
$server = proc_open(
    [PHP_BINARY, "-S", "127.0.0.1:{$port}", __DIR__ . "/fixtures/provider_server.php"],
    [0 => ["pipe", "r"], 1 => ["file", $serverOut, "a"], 2 => ["file", $serverOut, "a"]],
    $serverPipes,
    null,
    array_merge(getenv(), ["PHASEO_TEST_LOG" => $authLog])
);
try {
    for ($i = 0; $i < 100; $i++) {
        $socket = @fsockopen("127.0.0.1", $port, $errno, $errstr, 0.1);
        if ($socket !== false) {
            fclose($socket);
            break;
        }
        usleep(50000);
    }
    $providerCalls = 0;
    $gateway = AgentSdk::createGatewayAgentClient(new GatewayAgentClientOptions(
        clientOptions: [
            "api_key" => function () use (&$providerCalls): string {
                $providerCalls++;
                return "workload-token";
            },
            "base_url" => "http://127.0.0.1:{$port}/v1",
        ],
        model: "openai/gpt-5-nano"
    ));
    $providerResponse = $gateway->generate(new ModelRequest("provider", [new Message("user", "hi")], []));
    assert_true($providerResponse->message->content === "ok", "expected the local response");
    $responsesLines = array_values(array_filter(explode("\n", (string) file_get_contents($authLog)), fn ($line) => str_starts_with($line, "/v1/responses ")));
    assert_true($responsesLines === ["/v1/responses Bearer workload-token"] && $providerCalls >= 1, "expected the provider's bearer token on the request");
} finally {
    proc_terminate($server);
    proc_close($server);
    @unlink($authLog);
    @unlink($serverOut);
}
echo "php agent sdk credential provider tests ok" . PHP_EOL;

if(getenv("PHASEO_AGENT_LIVE_SMOKE")==="true"&&getenv("PHASEO_API_KEY")){$client=AgentSdk::createGatewayAgentClient(new GatewayAgentClientOptions(model:"openai/gpt-5.6-luna",includeMeta:true));$delta=false;$completed=false;foreach($client->stream(new ModelRequest("live-smoke",[new Message("user","Reply with exactly: luna-ok")],[]))as$event){if(($event["type"]??null)==="response.output_text.delta"&&($event["delta"]??"")!=="")$delta=true;if(($event["type"]??null)==="response.completed"&&($event["response"]??null)instanceof ModelResponse)$completed=true;}assert_true($delta&&$completed,"expected live Luna stream");echo "php agent sdk live Luna smoke ok".PHP_EOL;}
