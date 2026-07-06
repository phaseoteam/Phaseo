# Phaseo Agent SDK (PHP)

`phaseo/agent-sdk` is a minimal PHP agent runtime for Phaseo Gateway.

It provides:

- `AgentSdk::createAgent(...)`
- `AgentSdk::defineTool(...)`
- `AgentSdk::createGatewayAgentClient(...)`
- a bounded tool loop on top of the Phaseo `responses` API

## Install

```bash
composer require phaseo/sdk phaseo/agent-sdk
```

## Quickstart

```php
<?php
require "vendor/autoload.php";

use Phaseo\AgentSdk\AgentDefinition;
use Phaseo\AgentSdk\AgentSdk;

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
