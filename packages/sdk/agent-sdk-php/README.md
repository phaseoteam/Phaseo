# AI Stats Agent SDK (PHP)

`ai-stats/agent-sdk-php` is a minimal PHP agent runtime for AI Stats Gateway.

It provides:

- `AgentSdk::createAgent(...)`
- `AgentSdk::defineTool(...)`
- `AgentSdk::createGatewayAgentClient(...)`
- a bounded tool loop on top of the AI Stats `responses` API

## Install

```bash
composer require ai-stats/php-sdk ai-stats/agent-sdk-php
```

## Quickstart

```php
<?php
require "vendor/autoload.php";

use AIStats\AgentSdk\AgentDefinition;
use AIStats\AgentSdk\AgentSdk;

$agent = AgentSdk::createAgent(new AgentDefinition(
    id: "quickstart-agent",
    model: "openai/gpt-5.4-nano",
    instructions: "Answer concisely and helpfully."
));

$result = $agent->run(
    input: "Give me one fun fact about cURL.",
    client: AgentSdk::createGatewayAgentClient()
);

echo $result->output . PHP_EOL;
```
