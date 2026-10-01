<?php
declare(strict_types=1);

namespace Phaseo\AgentSdk;

if (!class_exists(\Phaseo\Sdk\Phaseo::class)) {
    $sdkEntryPoint = null;

    if (class_exists(\Composer\InstalledVersions::class)) {
        $sdkInstallPath = \Composer\InstalledVersions::getInstallPath("phaseo/sdk");
        if (is_string($sdkInstallPath)) {
            $sdkEntryPoint = $sdkInstallPath . "/src/index.php";
        }
    }

    $sdkEntryPoint ??= __DIR__ . "/../../sdk-php/src/index.php";
    if (!is_file($sdkEntryPoint)) {
        throw new \RuntimeException("Unable to load the installed phaseo/sdk package");
    }

    require_once $sdkEntryPoint;
}

use Phaseo\Sdk\Phaseo;
use JsonException;
use RuntimeException;

final class ToolCall
{
    public function __construct(
        public string $id,
        public string $name,
        public mixed $input
    ) {
    }
}

final class Message
{
    /** @param list<ToolCall> $toolCalls */
    public function __construct(
        public string $role,
        public string $content,
        public array $toolCalls = [],
        public ?string $toolCallId = null,
        public ?string $name = null
    ) {
    }
}

final class Tool
{
    /** @param callable(mixed, RuntimeContext): mixed $execute */
    public function __construct(
        public string $id,
        public mixed $execute,
        public ?string $description = null,
        public ?array $parameters = null,
        public ?int $timeoutMs = null,
        public mixed $inputSchema = null, public mixed $outputSchema = null, public mixed $eventSchema = null,
        public mixed $requireApproval = false, public mixed $onToolCalled = null, public mixed $onResponseReceived = null,
        public ?array $nextTurnParams = null, public string $onError = "fail-run"
    ) {
    }
}

final class RuntimeContext
{
    public function __construct(
        public string $runId,
        public string $agentId,
        public int $stepIndex,
        public mixed $context = null, public ?ToolCall $toolCall = null, public mixed $emitProgress = null, public mixed $setContext = null
    ) {
    }
}

final class ModelRequest
{
    /** @param list<Message> $messages
     *  @param list<Tool> $tools
     */
    public function __construct(
        public string $agentId,
        public array $messages,
        public array $tools,
        public ?string $model = null,
        public ?string $instructions = null,
        public mixed $context = null, public ?float $temperature = null, public ?int $maxOutputTokens = null, public ?float $topP = null
    ) {
    }
}

final class ModelResponse
{
    public function __construct(
        public Message $message,
        public ?array $usage = null,
        public ?string $requestId = null,
        public ?string $nativeResponseId = null,
        public ?string $provider = null,
        public ?string $model = null,
        public ?array $responseMeta = null, public ?string $finishReason = null, public float $cost = 0, public array $warnings = []
    ) {
    }
}

final class AgentDefinition
{
    /** @param list<Tool> $tools */
    public function __construct(
        public string $id,
        public mixed $model = null,
        public ?string $preset = null,
        public mixed $instructions = null,
        public array $tools = [],
        public int $maxSteps = 12,
        public mixed $parseOutput = null,
        public mixed $humanReview = null,
        public array $modelRetry = [],
        public array $toolExecution = [], public array $stopWhen = [], public mixed $outputSchema = null, public mixed $requireApproval = null,
        public mixed $temperature = null, public mixed $maxOutputTokens = null, public mixed $topP = null, public mixed $dynamicTools = null
    ) {
    }
}

final class RunStep
{
    /** @param list<ToolCall> $toolCalls */
    public function __construct(
        public int $index,
        public string $status = "pending",
        public array $toolCalls = [],
        public ?string $requestId = null,
        public ?string $nativeResponseId = null,
        public ?string $provider = null,
        public ?string $model = null,
        public int $modelAttempts = 0,
        public ?array $usage = null,
        public ?array $responseMeta = null,
        public ?string $error = null, public ?string $finishReason = null, public array $warnings = []
    ) {
    }
}

final class RunRecord
{
    /** @param list<Message> $messages */
    public function __construct(
        public string $id,
        public string $agentId,
        public string $status,
        public mixed $input,
        public array $messages,
        public mixed $context = null,
        public int $stepCount = 0,
        public mixed $result = null,
        public ?string $error = null,
        public ?HumanPause $pause = null,
        public string $createdAt = "",
        public string $updatedAt = "", public ?string $stopReason = null, public array $usage = ["input_tokens"=>0,"output_tokens"=>0,"cached_tokens"=>0,"total_tokens"=>0,"cost"=>0], public array $nextTurnParams = []
    ) {
    }
}

final class HumanReviewRequest
{
    public function __construct(public string $reason, public mixed $payload = null) {}
}

final class PendingToolCall { public function __construct(public ToolCall $call, public string $kind, public ?string $reason = null) {} }
final class ToolDecision { public function __construct(public string $toolCallId, public ?string $reason = null) {} }
final class ToolOutput { public function __construct(public string $toolCallId, public mixed $output) {} }

final class HumanPause
{
    public function __construct(public string $reason, public mixed $payload = null, public string $requestedAt = "", public string $kind = "human_review", public array $pendingToolCalls = []) {}
}

final class HumanReviewContext
{
    public function __construct(
        public string $runId, public string $agentId, public int $stepIndex, public mixed $input,
        public mixed $context, public array $messages, public ModelResponse $response, public mixed $parsedOutput = null
    ) {}
}

final class DevtoolsConfig
{
    public function __construct(public bool $enabled = true, public string $directory = ".phaseo-devtools") {}
}

final class RunResult
{
    /** @param list<RunStep> $steps
     *  @param list<Message> $messages
     */
    public function __construct(
        public RunRecord $run,
        public array $steps,
        public mixed $output,
        public array $messages, public array $usage = []
    ) {
    }
}

interface ModelClient
{
    public function generate(ModelRequest $request): ModelResponse;
}
interface StreamingModelClient extends ModelClient { public function stream(ModelRequest $request): iterable; }
interface StateAccessor { public function load(string $runId): ?RunResult; public function save(RunResult $result): void; }
final class AgentStreamResult {
	public ?RunResult $result=null;private array $events=[];private \Fiber $fiber;private ?\Throwable $error=null;private bool $cancelled=false;
	public function __construct(callable $execute){$this->fiber=new \Fiber(function()use($execute){try{$this->result=$execute(static function(array $event):void{\Fiber::suspend($event);});return $this->result;}catch(\Throwable $error){$this->error=$error;throw $error;}});}
	public function cancel():void{$this->cancelled=true;if($this->fiber->isSuspended())try{$this->fiber->throw(new RuntimeException("Agent stream cancelled"));}catch(\Throwable $error){$this->error=$error;}}
	private function advance():mixed{if($this->cancelled)return null;if(!$this->fiber->isStarted())return $this->fiber->start();if($this->fiber->isSuspended())return $this->fiber->resume();return null;}
	public function fullStream(): iterable { $index=0;while(true){while($index<count($this->events))yield $this->events[$index++];if($this->fiber->isTerminated())break;$event=$this->advance();if(is_array($event))$this->events[]=$event;}if($this->error)throw $this->error; }
	public function getResult():RunResult{foreach($this->fullStream() as $_){}if(!$this->result)throw new RuntimeException("Agent stream did not complete");return $this->result;}
	public function textStream(): iterable { foreach($this->fullStream() as $event) if(($event["type"]??null)==="response.output_text.delta") yield (string)($event["delta"]??""); }
	public function reasoningStream(): iterable { foreach($this->fullStream() as $event) if(($event["type"]??null)==="response.reasoning.delta") yield (string)($event["delta"]??""); }
	public function itemStream(): iterable { foreach($this->fullStream() as $event) if(($event["type"]??null)==="response.item") yield $event["item"]??null; }
}

final class GatewayAgentClientOptions
{
    /** @param array<string, mixed>|null $clientOptions
     *  @param array<string, mixed>|null $provider
     *  @param array<string, mixed>|null $reasoning
     *  @param array<string, string>|null $metadata
     *  @param array<string, mixed>|null $responseFormat
     *  @param array<string, mixed>|null $webSearchOptions
     *  @param list<array<string, mixed>>|null $plugins
     *  @param list<array<string, mixed>>|null $gatewayTools
     *  @param array<string, mixed>|null $providerOptions
     */
    public function __construct(
        public ?Phaseo $client = null,
        public ?array $clientOptions = null,
        public ?string $model = null,
        public ?string $preset = null,
        public ?array $provider = null,
        public ?array $reasoning = null,
        public ?float $temperature = null,
        public ?int $maxOutputTokens = null,
        public ?bool $parallelToolCalls = null,
        public ?array $metadata = null,
        public ?string $user = null,
        public ?array $responseFormat = null,
        public ?bool $includeMeta = null,
        public ?array $webSearchOptions = null,
        public ?array $plugins = null,
        public ?array $gatewayTools = null,
        public mixed $toolChoice = null,
        public ?array $providerOptions = null,
        public ?string $promptCacheKey = null,
        public ?array $requestOptions = null
    ) {
    }
}

final class GatewayAgentClient implements StreamingModelClient
{
    public function __construct(
        private Phaseo $client,
        private GatewayAgentClientOptions $options
    ) {
    }

    public function generate(ModelRequest $request): ModelResponse
    {
		$payload = $this->payload($request);
		$response = $this->client->createResponse($payload);
		return self::toModelResponse($response);
	}

	public function stream(ModelRequest $request): iterable
	{
		foreach($this->client->streamResponse($this->payload($request)) as $line){if(!str_starts_with($line,"data:"))continue;$data=trim(substr($line,5));if($data===""||$data==="[DONE]")continue;try{$raw=json_decode($data,true,512,JSON_THROW_ON_ERROR);}catch(JsonException){continue;}$type=(string)($raw["type"]??"");$delta=is_string($raw["delta"]??null)?$raw["delta"]:(is_string($raw["text"]??null)?$raw["text"]:null);if($type==="response.completed"){yield ["type"=>"response.completed","response"=>self::toModelResponse(is_array($raw["response"]??null)?$raw["response"]:$raw),"raw"=>$raw];return;}if(array_key_exists("item",$raw))yield ["type"=>"response.item","item"=>$raw["item"],"raw"=>$raw];if($delta!==null)yield ["type"=>str_contains($type,"reasoning")?"response.reasoning.delta":"response.output_text.delta","delta"=>$delta,"raw"=>$raw];}
	}

	private function payload(ModelRequest $request): array
	{
		return array_merge($this->options->requestOptions ?? [], array_filter([
            "model" => $request->model ?: $this->options->model ?: self::presetAlias($this->options->preset) ?: "phaseo/free",
            "input" => self::toResponsesInput($request->messages),
            "instructions" => self::toInstructions($request->messages, $request->instructions),
            "tools" => array_merge(
                array_map(
                    static function (Tool $tool): array {
                        return [
                            "type" => "function",
                            "function" => [
                                "name" => $tool->id,
                                "description" => $tool->description,
                                "parameters" => $tool->parameters ?? ["type" => "object", "additionalProperties" => true],
                            ],
                        ];
                    },
                    $request->tools
                ),
                $this->options->gatewayTools ?? []
            ),
            "tool_choice" => $this->options->toolChoice,
            "parallel_tool_calls" => $this->options->parallelToolCalls,
            "temperature" => $request->temperature ?? $this->options->temperature,
            "max_output_tokens" => $request->maxOutputTokens ?? $this->options->maxOutputTokens,
            "top_p" => $request->topP,
            "provider" => $this->options->provider,
            "reasoning" => $this->options->reasoning,
            "metadata" => $this->options->metadata,
            "meta" => $this->options->includeMeta,
            "user" => $this->options->user,
            "response_format" => $this->options->responseFormat,
            "web_search_options" => $this->options->webSearchOptions,
            "plugins" => $this->options->plugins,
            "provider_options" => $this->options->providerOptions,
            "prompt_cache_key" => $this->options->promptCacheKey,
        ], static fn (mixed $value): bool => $value !== null));

	}

	private static function toModelResponse(array $response): ModelResponse
	{
		$usage=is_array($response["usage"]??null)?$response["usage"]:null;$meta=is_array($response["meta"]??null)?$response["meta"]:null;$cost=0.0;foreach([$response["cost"]??null,$response["cost_usd"]??null,$usage["cost"]??null,$meta["cost"]??null,$meta["cost_usd"]??null] as $value)if(is_numeric($value)){$cost=(float)$value;break;}if($cost===0.0&&is_numeric($response["cost_nanos"]??null))$cost=(float)$response["cost_nanos"]/1_000_000_000;if($cost===0.0&&is_numeric($meta["cost_nanos"]??null))$cost=(float)$meta["cost_nanos"]/1_000_000_000;
		return new ModelResponse(
            message: new Message(
                role: "assistant",
                content: self::extractAssistantText($response),
                toolCalls: self::extractToolCalls($response)
            ),
			usage: $usage,
			requestId: self::stringOrNull($response["request_id"] ?? $response["id"] ?? null),
			nativeResponseId:self::stringOrNull($response["native_response_id"]??$response["nativeResponseId"]??null),
            provider: self::stringOrNull($response["provider"] ?? null),
            model: self::stringOrNull($response["model"] ?? null),
			responseMeta: $meta,
			finishReason:self::stringOrNull($response["finish_reason"]??$response["stop_reason"]??$response["status"]??null),cost:$cost,warnings:is_array($response["warnings"]??null)?$response["warnings"]:[]
		);
	}

    private static function presetAlias(?string $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $normalized = ltrim(trim($value), "@");
        return $normalized === "" ? null : "@{$normalized}";
    }

    private static function stringify(mixed $value): string
    {
        if (is_string($value)) {
            return $value;
        }

        try {
            return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        } catch (JsonException) {
            return (string) $value;
        }
    }

    /** @param list<Message> $messages
     *  @return list<array<string, mixed>>
     */
    private static function toResponsesInput(array $messages): array
    {
        $items = [];
        foreach ($messages as $message) {
            if ($message->role === "system") {
                continue;
            }
            if ($message->role === "tool") {
                $items[] = [
                    "type" => "function_call_output",
                    "call_id" => $message->toolCallId,
                    "output" => self::stringify($message->content),
                ];
                continue;
            }

            $item = [
                "type" => "message",
                "role" => $message->role,
                "content" => self::stringify($message->content),
            ];

            if ($message->role === "assistant" && $message->toolCalls !== []) {
                $item["tool_calls"] = array_map(
                    static function (ToolCall $toolCall): array {
                        return [
                            "id" => $toolCall->id,
                            "type" => "function",
                            "function" => [
                                "name" => $toolCall->name,
                                "arguments" => json_encode($toolCall->input, JSON_UNESCAPED_SLASHES),
                            ],
                        ];
                    },
                    $message->toolCalls
                );
            }

            $items[] = $item;
        }

        return $items;
    }

    /** @param list<Message> $messages */
    private static function toInstructions(array $messages, ?string $override): ?string
    {
        $systemParts = [];
        foreach ($messages as $message) {
            if ($message->role === "system" && trim($message->content) !== "") {
                $systemParts[] = trim($message->content);
            }
        }
        $systemText = implode("\n\n", $systemParts);
        if ($override && $systemText !== "") {
            return "{$override}\n\n{$systemText}";
        }
        return $override ?: ($systemText !== "" ? $systemText : null);
    }

    /** @return list<ToolCall> */
    private static function extractToolCalls(array $response): array
    {
        $items = $response["output_items"] ?? $response["output"] ?? [];
        if (!is_array($items)) {
            return [];
        }

        $calls = [];
        foreach (array_values($items) as $index => $item) {
            if (!is_array($item) || strtolower((string) ($item["type"] ?? "")) !== "function_call") {
                continue;
            }
            $calls[] = new ToolCall(
                id: (string) ($item["call_id"] ?? "tool_call_{$index}"),
                name: (string) ($item["name"] ?? "tool"),
                input: self::safeParseToolInput((string) ($item["arguments"] ?? ""))
            );
        }

        return $calls;
    }

    private static function extractAssistantText(array $response): string
    {
        $items = $response["output_items"] ?? $response["output"] ?? [];
        if (!is_array($items)) {
            return "";
        }

        $parts = [];
        foreach ($items as $item) {
            if (!is_array($item) || strtolower((string) ($item["type"] ?? "")) !== "message") {
                continue;
            }
            foreach (($item["content"] ?? []) as $part) {
                if (
                    is_array($part) &&
                    strtolower((string) ($part["type"] ?? "")) === "output_text" &&
                    is_string($part["text"] ?? null)
                ) {
                    $parts[] = $part["text"];
                }
            }
        }

        return implode("\n\n", $parts);
    }

    private static function safeParseToolInput(string $raw): mixed
    {
        if (trim($raw) === "") {
            return [];
        }

        try {
            return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return ["raw" => $raw];
        }
    }

    private static function stringOrNull(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== "" ? $value : null;
    }
}

final class Agent
{
    public function __construct(private AgentDefinition $definition)
    {
        $this->definition->tools ??= [];
        $this->definition->maxSteps = $this->definition->maxSteps > 0 ? $this->definition->maxSteps : 12;
    }

    public function run(
        mixed $input,
        ModelClient $client,
        mixed $context = null,
        ?string $model = null,
        ?int $maxSteps = null,
        ?string $preset = null,
        ?array $modelRetry = null,
        ?array $toolExecution = null,
        mixed $onEvent = null,
        ?DevtoolsConfig $devtools = null, ?StateAccessor $state = null
    ): RunResult {
        $startedAt = microtime(true);
        $runId = bin2hex(random_bytes(8));
        $createdAt = self::nowIso();
        $messages = [];
        if (is_string($this->definition->instructions) && $this->definition->instructions !== "") {
            $messages[] = new Message(role: "system", content: $this->definition->instructions);
        }
        $messages[] = new Message(
            role: "user",
            content: is_string($input) ? $input : json_encode($input, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );

        $run = new RunRecord(
            id: $runId, agentId: $this->definition->id, status: "queued", input: $input,
            messages: $messages, context: $context, createdAt: $createdAt, updatedAt: $createdAt
        );
        self::emit($onEvent, "run.started", $run);
        try {
            $result = $this->execute($run, [], $client, $context, $model, $preset, $maxSteps, $modelRetry, $toolExecution, $onEvent);
            $this->captureDevtools($result, "agent.run", $startedAt, $devtools);
            $state?->save($result);
            return $result;
        } catch (\Throwable $error) {
            $this->captureDevtools(null, "agent.run", $startedAt, $devtools, $error, $runId);
            throw $error;
        }
    }

    public function stream(mixed $input, ModelClient $client, mixed $context = null, ?StateAccessor $state = null): AgentStreamResult
    {
		return new AgentStreamResult(function($handler)use($input,$client,$context,$state){
			if($client instanceof StreamingModelClient){$client=new class($client,$handler) implements ModelClient{
				public function __construct(private StreamingModelClient $client,private mixed $handler){}
				public function generate(ModelRequest $request):ModelResponse{$text="";$completed=null;foreach($this->client->stream($request) as $event){$type=$event["type"]??null;if($type==="response.output_text.delta")$text.=(string)($event["delta"]??"");if($type==="response.completed")$completed=$event["response"]??null;($this->handler)($event);}return $completed instanceof ModelResponse?$completed:new ModelResponse(new Message("assistant",$text));}
			};}
			return $this->run($input,$client,$context,onEvent:$handler,state:$state);
		});
	}

	private function executeTool(Tool $tool,ToolCall $call,RunRecord $run,int $stepIndex,mixed $onEvent):Message
	{
		$call->input=self::validate($tool->inputSchema,$call->input,"tool input");self::emit($onEvent,"tool.started",$run,["step_index"=>$stepIndex,"tool_call_id"=>$call->id,"tool_name"=>$call->name]);$started=microtime(true);
		$runtime=new RuntimeContext($run->id,$run->agentId,$stepIndex,$run->context,$call,function($value)use($tool,$onEvent,$run,$stepIndex,$call){$checked=self::validate($tool->eventSchema,$value,"tool progress event");self::emit($onEvent,"tool.preliminary_result",$run,["step_index"=>$stepIndex,"tool_call_id"=>$call->id,"tool_name"=>$call->name,"result"=>$checked]);},function($value)use($run){$run->context=$value;});
		try{$output=($tool->execute)($call->input,$runtime);if($tool->timeoutMs&&((microtime(true)-$started)*1000)>$tool->timeoutMs)throw new RuntimeException("Tool {$call->name} timed out after {$tool->timeoutMs}ms");$output=self::validate($tool->outputSchema,$output,"tool output");}
		catch(\Throwable $error){self::emit($onEvent,"tool.failed",$run,["step_index"=>$stepIndex,"tool_call_id"=>$call->id,"tool_name"=>$call->name,"error"=>$error->getMessage()]);if($tool->onError!=="return-to-model")throw $error;return new Message("tool",json_encode(["error"=>$error->getMessage()]),toolCallId:$call->id,name:$tool->id);}
		self::emit($onEvent,"tool.completed",$run,["step_index"=>$stepIndex,"tool_call_id"=>$call->id,"tool_name"=>$call->name,"output"=>$output]);return new Message("tool",is_string($output)?$output:json_encode($output,JSON_UNESCAPED_SLASHES),toolCallId:$call->id,name:$tool->id);
	}

    public function continueRun(
        RunResult $run, ModelClient $client, ?string $humanInput = null, mixed $context = null,
        ?string $model = null, ?string $preset = null, ?int $maxSteps = null,
        ?array $modelRetry = null, ?array $toolExecution = null, mixed $onEvent = null,
        ?DevtoolsConfig $devtools = null, array $approvals = [], array $rejections = [], array $toolOutputs = [], ?StateAccessor $state = null
    ): RunResult {
        if ($run->run->agentId !== $this->definition->id) {
            throw new RuntimeException("Run {$run->run->id} belongs to agent {$run->run->agentId}");
        }
        if ($run->run->status === "waiting_for_human" && (!$humanInput || trim($humanInput) === "") && !$run->run->pause?->pendingToolCalls) {
            throw new RuntimeException("Run {$run->run->id} is waiting for human input");
        }
        $startedAt = microtime(true);
        $previousStatus = $run->run->status;
        if ($humanInput && trim($humanInput) !== "") {
            $run->run->messages[] = new Message(role: "user", content: $humanInput);
            $run->run->pause = null;
        } elseif ($run->run->pause?->pendingToolCalls) {
            $approved = []; $rejected = []; $outputs = []; $tools = [];
            foreach ($approvals as $item) { $approved[is_string($item) ? $item : $item->toolCallId] = $item; }
            foreach ($rejections as $item) { $rejected[is_string($item) ? $item : $item->toolCallId] = $item; }
            foreach ($toolOutputs as $item) { $outputs[$item->toolCallId] = $item->output; }
            foreach ($this->definition->tools as $item) { $tools[$item->id] = $item; }
            foreach ($run->run->pause->pendingToolCalls as $pending) {
				$call = $pending->call; $tool = $tools[$call->name]; $runtime = new RuntimeContext($run->run->id,$run->run->agentId,$run->run->stepCount-1,$run->run->context,$call,setContext:function($value)use($run){$run->run->context=$value;});
                if (isset($rejected[$call->id])) { $reason = is_string($rejected[$call->id]) ? "Tool call rejected" : ($rejected[$call->id]->reason ?? "Tool call rejected"); $run->run->messages[] = new Message("tool",json_encode(["error"=>$reason]),toolCallId:$call->id,name:$tool->id); continue; }
				if ($pending->kind === "approval") { if (!isset($approved[$call->id])) throw new RuntimeException("Missing approval decision for tool call {$call->id}"); $run->run->messages[]=$this->executeTool($tool,$call,$run->run,$run->run->stepCount-1,$onEvent);if($tool->nextTurnParams)$run->run->nextTurnParams=$tool->nextTurnParams;continue; }
                else { if (!array_key_exists($call->id,$outputs)) throw new RuntimeException("Missing output for tool call {$call->id}"); $value=$outputs[$call->id]; if(is_callable($tool->onResponseReceived)) $value=($tool->onResponseReceived)($value,$runtime); }
				$value=self::validate($tool->outputSchema,$value,"tool output"); $run->run->messages[]=new Message("tool",is_string($value)?$value:json_encode($value),toolCallId:$call->id,name:$tool->id);if($tool->nextTurnParams)$run->run->nextTurnParams=$tool->nextTurnParams;
            }
            $run->run->pause = null;
        }
        $run->run->status = "running";
        $run->run->updatedAt = self::nowIso();
        self::emit($onEvent, "run.resumed", $run->run, ["previous_status" => $previousStatus]);
        try {
            $result = $this->execute(
                $run->run, $run->steps, $client, $context ?? $run->run->context, $model, $preset,
                $maxSteps, $modelRetry, $toolExecution, $onEvent
            );
            $this->captureDevtools($result, "agent.continue", $startedAt, $devtools);
            $state?->save($result);
            return $result;
        } catch (\Throwable $error) {
            $this->captureDevtools(null, "agent.continue", $startedAt, $devtools, $error, $run->run->id);
            throw $error;
        }
    }

    public function continueRunById(string $runId, StateAccessor $state, ModelClient $client, array $approvals = [], array $rejections = [], array $toolOutputs = []): RunResult
    {
        $run=$state->load($runId);if(!$run)throw new RuntimeException("Run {$runId} not found");return $this->continueRun($run,$client,approvals:$approvals,rejections:$rejections,toolOutputs:$toolOutputs,state:$state);
    }

	public function continueStream(RunResult $run,ModelClient $client,?string $humanInput=null,array $approvals=[],array $rejections=[],array $toolOutputs=[],?StateAccessor $state=null):AgentStreamResult
	{
		return new AgentStreamResult(function($handler)use($run,$client,$humanInput,$approvals,$rejections,$toolOutputs,$state){if($client instanceof StreamingModelClient){$client=new class($client,$handler) implements ModelClient{public function __construct(private StreamingModelClient $client,private mixed $handler){}public function generate(ModelRequest $request):ModelResponse{$text="";$completed=null;foreach($this->client->stream($request)as$event){if(($event["type"]??null)==="response.output_text.delta")$text.=$event["delta"]??"";if(($event["type"]??null)==="response.completed")$completed=$event["response"]??null;($this->handler)($event);}return $completed instanceof ModelResponse?$completed:new ModelResponse(new Message("assistant",$text));}};}return $this->continueRun($run,$client,$humanInput,onEvent:$handler,approvals:$approvals,rejections:$rejections,toolOutputs:$toolOutputs,state:$state);});
	}

    private function execute(
        RunRecord $run, array $steps, ModelClient $client, mixed $context, ?string $model,
        ?string $preset, ?int $maxSteps, ?array $modelRetry, ?array $toolExecution, mixed $onEvent
    ): RunResult {
        $run->status = "running";
        $effectiveMaxSteps = $maxSteps && $maxSteps > 0 ? $maxSteps : $this->definition->maxSteps;
        $retry = array_merge(["max_retries" => 0, "backoff_ms" => 250], $this->definition->modelRetry, $modelRetry ?? []);
        $toolsById = [];
        foreach ($this->definition->tools as $tool) { $toolsById[$tool->id] = $tool; }
        $targetModel = $model ?: self::presetAlias($preset) ?: (is_string($this->definition->model)?$this->definition->model:null) ?: self::presetAlias($this->definition->preset);$nextTurn=$run->nextTurnParams?:null;$run->nextTurnParams=[];$loopStarted=microtime(true);

        for ($stepIndex = $run->stepCount; $stepIndex < $effectiveMaxSteps; $stepIndex++) {
            $turn=["number_of_turns"=>$stepIndex+1,"step_index"=>$stepIndex,"messages"=>$run->messages,"context"=>$run->context];$turnModel=is_callable($this->definition->model)?($this->definition->model)($turn):$targetModel;$turnInstructions=is_callable($this->definition->instructions)?($this->definition->instructions)($turn):$this->definition->instructions;$temperature=is_callable($this->definition->temperature)?($this->definition->temperature)($turn):$this->definition->temperature;$maxOutput=is_callable($this->definition->maxOutputTokens)?($this->definition->maxOutputTokens)($turn):$this->definition->maxOutputTokens;$topP=is_callable($this->definition->topP)?($this->definition->topP)($turn):$this->definition->topP;$turnTools=is_callable($this->definition->dynamicTools)?($this->definition->dynamicTools)($turn):$this->definition->tools;if($nextTurn){$turnModel=$nextTurn["model"]??$turnModel;$turnInstructions=$nextTurn["instructions"]??$turnInstructions;$temperature=$nextTurn["temperature"]??$temperature;$maxOutput=$nextTurn["max_output_tokens"]??$maxOutput;$topP=$nextTurn["top_p"]??$topP;$turnTools=$nextTurn["tools"]??$turnTools;$nextTurn=null;}$toolsById=[];foreach($turnTools as $item){$toolsById[$item->id]=$item;}
            $step = new RunStep(index: $stepIndex, status: "executing_model");
            $steps[] = $step;
            self::emit($onEvent, "step.started", $run, ["step_index" => $stepIndex]);
            $response = null;
            for ($attempt = 0; $attempt <= max(0, (int)$retry["max_retries"]); $attempt++) {
                $step->modelAttempts = $attempt + 1;
                self::emit($onEvent, "model.requested", $run, ["step_index" => $stepIndex, "attempt" => $attempt + 1, "model" => $turnModel]);
                try {
                    $response = $client->generate(new ModelRequest(
                        agentId: $this->definition->id, model: $turnModel,
                        instructions: $turnInstructions, messages: $run->messages,
                        tools: $turnTools, context: $run->context, temperature:$temperature, maxOutputTokens:$maxOutput, topP:$topP
                    ));
                    break;
                } catch (\Throwable $error) {
                    if ($attempt >= (int)$retry["max_retries"]) { $step->status = "failed"; $step->error = $error->getMessage(); throw $error; }
                    usleep(max(0, (int)$retry["backoff_ms"]) * ($attempt + 1) * 1000);
                }
            }
            if (!$response instanceof ModelResponse) { throw new RuntimeException("Model client returned no response"); }
            $run->messages[] = $response->message;
            $run->stepCount = $stepIndex + 1;
            $run->updatedAt = self::nowIso();
            $step->toolCalls = $response->message->toolCalls;
            $step->requestId = $response->requestId;
            $step->nativeResponseId = $response->nativeResponseId;
            $step->provider = $response->provider;
            $step->model = $response->model ?: $turnModel;
            $step->usage = $response->usage;
            $step->responseMeta = $response->responseMeta;
            $step->finishReason=$response->finishReason;$step->warnings=$response->warnings;
            $usage=self::usage($response); foreach($usage as $key=>$value){$run->usage[$key]=($run->usage[$key]??0)+$value;}
            self::emit($onEvent, "model.completed", $run, ["step_index" => $stepIndex, "attempt" => $step->modelAttempts, "request_id" => $step->requestId, "model" => $step->model]);

            $parsedOutput = $response->message->toolCalls === [] && $this->definition->parseOutput
                ? ($this->definition->parseOutput)($response->message->content) : null;
            if ($this->definition->humanReview) {
                $review = ($this->definition->humanReview)(new HumanReviewContext(
                    runId: $run->id, agentId: $run->agentId, stepIndex: $stepIndex, input: $run->input,
                    context: $context, messages: $run->messages, response: $response, parsedOutput: $parsedOutput
                ));
                if ($review instanceof HumanReviewRequest) {
                    $run->status = "waiting_for_human";
                    $run->pause = new HumanPause($review->reason, $review->payload, self::nowIso());
                    $step->status = "checkpointed";
                    self::emit($onEvent, "checkpoint.saved", $run, ["step_index" => $stepIndex]);
                    self::emit($onEvent, "run.waiting_for_human", $run, ["step_index" => $stepIndex, "pause" => $run->pause]);
                    return new RunResult($run, $steps, null, $run->messages);
                }
            }

            if ($response->message->toolCalls === []) {
                $output = $this->definition->parseOutput
                    ? $parsedOutput
                    : $response->message->content;
                $output=self::validate($this->definition->outputSchema,$output,"agent output");
                foreach($this->definition->stopWhen as $condition){$reason=$condition(["step_count"=>$run->stepCount,"usage"=>$run->usage,"tool_calls"=>[],"finish_reason"=>$response->finishReason,"elapsed_ms"=>(microtime(true)-$loopStarted)*1000]);if($reason){$run->status="stopped";$run->stopReason=(string)$reason;$run->result=$output;return new RunResult($run,$steps,$output,$run->messages,$run->usage);}}
                $run->status = "completed"; $run->result = $output; $run->pause = null;
                $step->status = "checkpointed";
                self::emit($onEvent, "checkpoint.saved", $run, ["step_index" => $stepIndex]);
                self::emit($onEvent, "run.completed", $run, ["output" => $output]);
                return new RunResult($run, $steps, $output, $run->messages, $run->usage);
            }

            $run->status = "waiting_for_tools";
            $step->status = "executing_tools";
            $automatic=[];$pending=[];
            foreach ($response->message->toolCalls as $toolCall) {
                $tool = $toolsById[$toolCall->name] ?? null;
                if (!$tool instanceof Tool) {
                    throw new RuntimeException("Unknown tool '{$toolCall->name}'");
                }
                $toolCall->input=self::validate($tool->inputSchema,$toolCall->input,"tool input");
                $runtime=new RuntimeContext($run->id,$run->agentId,$stepIndex,$run->context,$toolCall);
                if(is_callable($tool->onToolCalled)){ $prefetched=($tool->onToolCalled)($toolCall->input,$runtime); if($prefetched===null){$pending[]=new PendingToolCall($toolCall,"hitl","Tool requires human input");}else{$run->messages[]=new Message("tool",json_encode(self::validate($tool->outputSchema,$prefetched,"tool output")),toolCallId:$toolCall->id,name:$tool->id);} continue; }
                $gated=is_callable($tool->requireApproval)?($tool->requireApproval)($toolCall->input,$runtime):(bool)$tool->requireApproval; if(is_callable($this->definition->requireApproval))$gated=($this->definition->requireApproval)($toolCall,$runtime);
                if($gated){$pending[]=new PendingToolCall($toolCall,"approval","Tool requires approval");continue;} if(!is_callable($tool->execute)){$pending[]=new PendingToolCall($toolCall,"manual","Tool requires external output");continue;}

				$run->messages[]=$this->executeTool($tool,$toolCall,$run,$stepIndex,$onEvent);
                if($tool->nextTurnParams)$nextTurn=$tool->nextTurnParams;
            }
            if($pending){$run->status="waiting_for_human";$run->nextTurnParams=$nextTurn??[];$run->pause=new HumanPause("Pending tool calls require input",$pending,self::nowIso(),in_array("approval",array_map(fn($item)=>$item->kind,$pending),true)?"tool_approval":$pending[0]->kind,$pending);$step->status="checkpointed";self::emit($onEvent,"run.waiting_for_human",$run,["step_index"=>$stepIndex,"pause"=>$run->pause]);return new RunResult($run,$steps,null,$run->messages,$run->usage);}
            foreach($this->definition->stopWhen as $condition){$reason=$condition(["step_count"=>$run->stepCount,"usage"=>$run->usage,"tool_calls"=>$response->message->toolCalls,"finish_reason"=>$response->finishReason,"elapsed_ms"=>(microtime(true)-$loopStarted)*1000]);if($reason){$run->status="stopped";$run->stopReason=(string)$reason;$run->result=$response->message->content;return new RunResult($run,$steps,$run->result,$run->messages,$run->usage);}}
            $step->status = "checkpointed";
            self::emit($onEvent, "checkpoint.saved", $run, ["step_index" => $stepIndex]);
        }

        $run->status = "failed"; $run->error = "Max steps exceeded ({$effectiveMaxSteps})";
        self::emit($onEvent, "run.failed", $run, ["error" => $run->error]);
        throw new RuntimeException($run->error);
    }

    private static function nowIso(): string { return gmdate("Y-m-d\\TH:i:s") . sprintf(".%03dZ", (int)((microtime(true) * 1000) % 1000)); }
    private static function validate(mixed $schema, mixed $value, string $label): mixed { if (!is_callable($schema)) return $value; try { return $schema($value); } catch (\Throwable $error) { throw new RuntimeException("Invalid {$label}: {$error->getMessage()}",0,$error); } }
    private static function usage(ModelResponse $response): array { $raw=$response->usage??[]; $input=(int)($raw["input_tokens"]??$raw["prompt_tokens"]??0); $output=(int)($raw["output_tokens"]??$raw["completion_tokens"]??0); return ["input_tokens"=>$input,"output_tokens"=>$output,"cached_tokens"=>(int)($raw["cached_tokens"]??$raw["cache_read_input_tokens"]??0),"total_tokens"=>(int)($raw["total_tokens"]??($input+$output)),"cost"=>$response->cost]; }

    private static function emit(mixed $handler, string $type, RunRecord $run, array $details = []): void
    {
        if (is_callable($handler)) { $handler(array_merge(["type" => $type, "run_id" => $run->id, "agent_id" => $run->agentId, "timestamp" => self::nowIso(), "status" => $run->status], $details)); }
    }

    private function captureDevtools(?RunResult $result, string $operation, float $startedAt, ?DevtoolsConfig $config, ?\Throwable $error = null, ?string $runId = null): void
    {
        $enabled = $config?->enabled ?? getenv("PHASEO_DEVTOOLS") === "true";
        if (!$enabled) { return; }
        $directory = $config?->directory ?: (getenv("PHASEO_DEVTOOLS_DIR") ?: ".phaseo-devtools");
        foreach (["images", "audio", "video"] as $kind) { @mkdir("{$directory}/assets/{$kind}", 0777, true); }
        if (!file_exists("{$directory}/metadata.json")) { file_put_contents("{$directory}/metadata.json", json_encode(["session_id" => bin2hex(random_bytes(8)), "started_at" => (int)($startedAt * 1000), "sdk" => "php"], JSON_PRETTY_PRINT)); }
        $record = $result?->run;
        $entry = [
            "id" => $record?->id ?? $runId ?? bin2hex(random_bytes(8)), "type" => $operation,
            "timestamp" => (int)($startedAt * 1000), "request" => ["agent_id" => $this->definition->id, "tool_count" => count($this->definition->tools)],
            "response" => $result, "error" => $error ? ["message" => $error->getMessage()] : null,
            "metadata" => ["sdk" => "php", "agent_id" => $this->definition->id, "run_id" => $record?->id ?? $runId, "run_status" => $record?->status],
        ];
        file_put_contents("{$directory}/generations.jsonl", json_encode($entry, JSON_UNESCAPED_SLASHES) . PHP_EOL, FILE_APPEND);
    }

    private static function presetAlias(?string $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $normalized = ltrim(trim($value), "@");
        return $normalized === "" ? null : "@{$normalized}";
    }
}

final class AgentSdk
{
    public static function stepCountIs(int $limit): callable{return fn($state)=>$state["step_count"]>=$limit?"step_count:{$limit}":null;}
    public static function maxTokensUsed(int $limit): callable{return fn($state)=>$state["usage"]["total_tokens"]>=$limit?"max_tokens:{$limit}":null;}
    public static function maxCost(float $limit): callable{return fn($state)=>$state["usage"]["cost"]>=$limit?"max_cost:{$limit}":null;}
    public static function maxDuration(int $milliseconds): callable{return fn($state)=>$state["elapsed_ms"]>=$milliseconds?"max_duration:{$milliseconds}":null;}
    public static function hasToolCall(string $name): callable{return fn($state)=>in_array($name,array_map(fn($call)=>$call->name,$state["tool_calls"]),true)?"tool_call:{$name}":null;}
    public static function finishReasonIs(string $reason): callable{return fn($state)=>($state["finish_reason"]??null)===$reason?"finish_reason:{$reason}":null;}
    public static function createAgentDevtools(string $directory = ".phaseo-devtools"): DevtoolsConfig
    {
        return new DevtoolsConfig(enabled: true, directory: $directory);
    }

    public static function defineTool(Tool $tool): Tool
    {
        return $tool;
    }

    public static function createAgent(AgentDefinition $definition): Agent
    {
        return new Agent($definition);
    }

    public static function createGatewayAgentClient(?GatewayAgentClientOptions $options = null): GatewayAgentClient
    {
        $options ??= new GatewayAgentClientOptions();
        $client = $options->client;
        if (!$client instanceof Phaseo) {
            $clientOptions = $options->clientOptions ?? [];
            $apiKey = is_string($clientOptions["api_key"] ?? null)
                ? $clientOptions["api_key"]
                : (getenv("PHASEO_API_KEY"));
            if (!is_string($apiKey) || trim($apiKey) === "") {
                throw new RuntimeException("PHASEO_API_KEY is required");
            }
            $baseUrl = is_string($clientOptions["base_url"] ?? null)
                ? $clientOptions["base_url"]
                : (getenv("PHASEO_BASE_URL") ?: "https://api.phaseo.app/v1");
            $client = new Phaseo(apiKey: $apiKey, basePath: $baseUrl, clientSource: "phaseo-agent-php", clientSourceVersion: "0.3.0");
        }

        return new GatewayAgentClient($client, $options);
    }
}
