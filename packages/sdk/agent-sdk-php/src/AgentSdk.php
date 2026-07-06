<?php
declare(strict_types=1);

namespace Phaseo\AgentSdk;

if (!class_exists(\Phaseo\Sdk\Phaseo::class)) {
    require_once __DIR__ . "/../../sdk-php/src/index.php";
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
        public ?array $parameters = null
    ) {
    }
}

final class RuntimeContext
{
    public function __construct(
        public string $runId,
        public string $agentId,
        public int $stepIndex,
        public mixed $context = null
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
        public mixed $context = null
    ) {
    }
}

final class ModelResponse
{
    public function __construct(
        public Message $message,
        public ?array $usage = null,
        public ?string $requestId = null,
        public ?string $provider = null,
        public ?string $model = null,
        public ?array $responseMeta = null
    ) {
    }
}

final class AgentDefinition
{
    /** @param list<Tool> $tools */
    public function __construct(
        public string $id,
        public ?string $model = null,
        public ?string $preset = null,
        public ?string $instructions = null,
        public array $tools = [],
        public int $maxSteps = 8,
        public mixed $parseOutput = null
    ) {
    }
}

final class RunStep
{
    /** @param list<ToolCall> $toolCalls */
    public function __construct(
        public int $index,
        public array $toolCalls = [],
        public ?string $requestId = null,
        public ?string $provider = null,
        public ?string $model = null
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
        public int $stepCount = 0,
        public mixed $result = null,
        public ?string $error = null
    ) {
    }
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
        public array $messages
    ) {
    }
}

interface ModelClient
{
    public function generate(ModelRequest $request): ModelResponse;
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
        public ?string $promptCacheKey = null
    ) {
    }
}

final class GatewayAgentClient implements ModelClient
{
    public function __construct(
        private Phaseo $client,
        private GatewayAgentClientOptions $options
    ) {
    }

    public function generate(ModelRequest $request): ModelResponse
    {
        $payload = array_filter([
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
            "temperature" => $this->options->temperature,
            "max_output_tokens" => $this->options->maxOutputTokens,
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
        ], static fn (mixed $value): bool => $value !== null);

        $response = $this->client->createResponse($payload);

        return new ModelResponse(
            message: new Message(
                role: "assistant",
                content: self::extractAssistantText($response),
                toolCalls: self::extractToolCalls($response)
            ),
            usage: is_array($response["usage"] ?? null) ? $response["usage"] : null,
            requestId: self::stringOrNull($response["id"] ?? null),
            provider: self::stringOrNull($response["provider"] ?? null),
            model: self::stringOrNull($response["model"] ?? null),
            responseMeta: is_array($response["meta"] ?? null) ? $response["meta"] : null
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
        $this->definition->maxSteps = $this->definition->maxSteps > 0 ? $this->definition->maxSteps : 8;
    }

    public function run(
        mixed $input,
        ModelClient $client,
        mixed $context = null,
        ?string $model = null,
        ?int $maxSteps = null
    ): RunResult {
        $runId = bin2hex(random_bytes(8));
        $messages = [];
        if ($this->definition->instructions) {
            $messages[] = new Message(role: "system", content: $this->definition->instructions);
        }
        $messages[] = new Message(
            role: "user",
            content: is_string($input) ? $input : json_encode($input, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );

        $steps = [];
        $effectiveMaxSteps = $maxSteps && $maxSteps > 0 ? $maxSteps : $this->definition->maxSteps;
        $toolsById = [];
        foreach ($this->definition->tools as $tool) {
            $toolsById[$tool->id] = $tool;
        }

        for ($stepIndex = 0; $stepIndex < $effectiveMaxSteps; $stepIndex++) {
            $response = $client->generate(
                new ModelRequest(
                    agentId: $this->definition->id,
                    model: $model ?: $this->definition->model ?: self::presetAlias($this->definition->preset),
                    instructions: $this->definition->instructions,
                    messages: $messages,
                    tools: $this->definition->tools,
                    context: $context
                )
            );

            $messages[] = $response->message;
            $steps[] = new RunStep(
                index: $stepIndex,
                toolCalls: $response->message->toolCalls,
                requestId: $response->requestId,
                provider: $response->provider,
                model: $response->model
            );

            if ($response->message->toolCalls === []) {
                $output = $this->definition->parseOutput
                    ? ($this->definition->parseOutput)($response->message->content)
                    : $response->message->content;
                $run = new RunRecord(
                    id: $runId,
                    agentId: $this->definition->id,
                    status: "completed",
                    input: $input,
                    messages: $messages,
                    stepCount: count($steps),
                    result: $output
                );

                return new RunResult(
                    run: $run,
                    steps: $steps,
                    output: $output,
                    messages: $messages
                );
            }

            foreach ($response->message->toolCalls as $toolCall) {
                $tool = $toolsById[$toolCall->name] ?? null;
                if (!$tool instanceof Tool) {
                    throw new RuntimeException("Unknown tool '{$toolCall->name}'");
                }

                $toolOutput = ($tool->execute)(
                    $toolCall->input,
                    new RuntimeContext(
                        runId: $runId,
                        agentId: $this->definition->id,
                        stepIndex: $stepIndex,
                        context: $context
                    )
                );

                $messages[] = new Message(
                    role: "tool",
                    name: $tool->id,
                    toolCallId: $toolCall->id,
                    content: is_string($toolOutput) ? $toolOutput : json_encode($toolOutput, JSON_UNESCAPED_SLASHES)
                );
            }
        }

        throw new RuntimeException("Agent exceeded max_steps={$effectiveMaxSteps}");
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
            $client = new Phaseo(apiKey: $apiKey, basePath: $baseUrl);
        }

        return new GatewayAgentClient($client, $options);
    }
}
