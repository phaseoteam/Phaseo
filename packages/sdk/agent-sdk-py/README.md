# AI Stats Agent SDK (Python)

`ai-stats-agent-sdk` is a minimal Python agent runtime for AI Stats Gateway.

It provides:

- `create_agent(...)`
- `define_tool(...)`
- `create_gateway_agent_client(...)`
- a bounded tool loop on top of the AI Stats `responses` API

## Install

```bash
pip install ai-stats-py-sdk ai-stats-agent-sdk
```

## Quickstart

```python
from ai_stats_agent import create_agent, create_gateway_agent_client

agent = create_agent({
    "id": "quickstart-agent",
    "model": "openai/gpt-5.4-nano",
    "instructions": "Answer concisely and helpfully.",
})

result = agent.run(
    input="Give me one fun fact about cURL.",
    client=create_gateway_agent_client(),
)

print(result.output)
```
